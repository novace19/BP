CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client' CHECK(role IN ('client','admin')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX session_expiry ON auth_sessions(expires_at);
CREATE TABLE trainers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '',
  specialty TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE rooms (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 500)
);
CREATE TABLE lessons (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'group' CHECK(kind IN ('group','personal')),
  duration INTEGER NOT NULL CHECK(duration BETWEEN 15 AND 240),
  color TEXT NOT NULL DEFAULT 'purple' CHECK(color IN ('purple','green','orange','blue')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE class_sessions (
  id INTEGER PRIMARY KEY, lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  trainer_id INTEGER NOT NULL REFERENCES trainers(id), room_id INTEGER NOT NULL REFERENCES rooms(id),
  start_at INTEGER NOT NULL, end_at INTEGER NOT NULL CHECK(end_at > start_at),
  capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published','cancelled'))
);
CREATE INDEX schedule_time ON class_sessions(start_at, status);
CREATE TABLE reservations (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  session_id INTEGER NOT NULL REFERENCES class_sessions(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
  created_at INTEGER NOT NULL, cancelled_at INTEGER, cancelled_by INTEGER REFERENCES users(id)
);
CREATE UNIQUE INDEX active_reservation ON reservations(user_id,session_id) WHERE status='active';
CREATE INDEX reservation_capacity ON reservations(session_id,status);
CREATE TABLE visits (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  reservation_id INTEGER UNIQUE REFERENCES reservations(id),
  visited_at INTEGER NOT NULL, recorded_by INTEGER NOT NULL REFERENCES users(id),
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX visit_user_date ON visits(user_id,visited_at);
CREATE TABLE audit (
  id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER NOT NULL,
  details TEXT NOT NULL, created_at INTEGER NOT NULL
);
-- Database-level backstop; services also return friendly validation errors.
CREATE TRIGGER reserve_capacity BEFORE INSERT ON reservations WHEN NEW.status='active'
BEGIN
  SELECT CASE WHEN (SELECT status FROM class_sessions WHERE id=NEW.session_id) != 'published'
    THEN RAISE(ABORT,'session_unavailable') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM reservations WHERE session_id=NEW.session_id AND status='active')
    >= (SELECT capacity FROM class_sessions WHERE id=NEW.session_id)
    THEN RAISE(ABORT,'session_full') END;
END;
CREATE TRIGGER capacity_update BEFORE UPDATE OF capacity ON class_sessions
BEGIN
  SELECT CASE WHEN NEW.capacity < (SELECT COUNT(*) FROM reservations WHERE session_id=NEW.id AND status='active')
    THEN RAISE(ABORT,'capacity_below_bookings') END;
END;
