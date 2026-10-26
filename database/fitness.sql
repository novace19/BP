-- Importujte jednou do MySQL / MariaDB pomocí phpMyAdmin.
-- Neobsahuje DROP ani výchozí hesla. Ukázkové termíny jsou relativní ke dni importu.
CREATE DATABASE IF NOT EXISTS fitness CHARACTER SET utf8mb4 COLLATE utf8mb4_czech_ci;
USE fitness;
SET NAMES utf8mb4;
CREATE TABLE users (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 email VARCHAR(190) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 role ENUM('client','admin') NOT NULL DEFAULT 'client',
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE trainers (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 specialty VARCHAR(190) NOT NULL,
 bio TEXT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;
CREATE TABLE rooms (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL UNIQUE,
 capacity SMALLINT UNSIGNED NOT NULL
) ENGINE=InnoDB;
CREATE TABLE lessons (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 description TEXT NOT NULL,
 kind ENUM('group','personal') NOT NULL DEFAULT 'group',
 duration_minutes SMALLINT UNSIGNED NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;
CREATE TABLE sessions (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 lesson_id INT UNSIGNED NOT NULL,
 trainer_id INT UNSIGNED NOT NULL,
 room_id INT UNSIGNED NOT NULL,
 starts_at DATETIME NOT NULL,
 ends_at DATETIME NOT NULL,
 capacity SMALLINT UNSIGNED NOT NULL,
 kind ENUM('group','personal') NOT NULL DEFAULT 'group',
 status ENUM('published','cancelled') NOT NULL DEFAULT 'published',
 FOREIGN KEY (lesson_id) REFERENCES lessons(id),
 FOREIGN KEY (trainer_id) REFERENCES trainers(id),
 FOREIGN KEY (room_id) REFERENCES rooms(id),
 INDEX timetable (starts_at,status),
 INDEX trainer_time (trainer_id,starts_at),
 INDEX room_time (room_id,starts_at)
) ENGINE=InnoDB;
CREATE TABLE reservations (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL,
 session_id INT UNSIGNED NOT NULL,
 status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
 attendance ENUM('pending','present','absent') NOT NULL DEFAULT 'pending',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 cancelled_at DATETIME NULL,
 FOREIGN KEY (user_id) REFERENCES users(id),
 FOREIGN KEY (session_id) REFERENCES sessions(id),
 UNIQUE KEY one_reservation (user_id,session_id),
 INDEX occupancy (session_id,status)
) ENGINE=InnoDB;
CREATE TABLE login_attempts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 ip_hash CHAR(64) NOT NULL,
 attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX login_window (ip_hash,attempted_at)
) ENGINE=InnoDB;
INSERT INTO trainers(name,specialty,bio) VALUES
('Anna Novotná','Jóga a mobilita','Zaměřuje se na zdravý pohyb, mobilitu a relaxaci.'),
('Petr Dvořák','Silový a osobní trénink','Pomůže s technikou cvičení a individuálním tréninkem.'),
('Klára Svobodová','Kondiční trénink','Vede skupinové lekce zaměřené na kondici a celé tělo.');
INSERT INTO rooms(name,capacity) VALUES ('Sál Pohyb',16),('Sál Síla',12),('Osobní zóna',1);
INSERT INTO lessons(name,description,kind,duration_minutes) VALUES
('Ranní jóga','Klidná lekce pro protažení celého těla. Vhodná i pro začátečníky.','group',60),
('Kruhový trénink','Kondiční cvičení na stanovištích s vlastní vahou i pomůckami.','group',50),
('Zdravá záda','Kompenzační cvičení, stabilita a mobilita.','group',45),
('Osobní trénink','Individuální trénink přizpůsobený vašim cílům.','personal',60);
INSERT INTO sessions(lesson_id,trainer_id,room_id,starts_at,ends_at,capacity) VALUES
(1,1,1,TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY,'08:00:00'),TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY,'09:00:00'),16),
(2,3,2,TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY,'17:00:00'),TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY,'17:50:00'),12),
(4,2,3,TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY,'15:00:00'),TIMESTAMP(CURRENT_DATE + INTERVAL 1 DAY,'16:00:00'),1),
(3,1,1,TIMESTAMP(CURRENT_DATE + INTERVAL 2 DAY,'16:00:00'),TIMESTAMP(CURRENT_DATE + INTERVAL 2 DAY,'16:45:00'),14),
(2,3,2,TIMESTAMP(CURRENT_DATE + INTERVAL 2 DAY,'18:00:00'),TIMESTAMP(CURRENT_DATE + INTERVAL 2 DAY,'18:50:00'),12),
(4,2,3,TIMESTAMP(CURRENT_DATE + INTERVAL 3 DAY,'14:00:00'),TIMESTAMP(CURRENT_DATE + INTERVAL 3 DAY,'15:00:00'),1),
(1,1,1,TIMESTAMP(CURRENT_DATE + INTERVAL 3 DAY,'09:00:00'),TIMESTAMP(CURRENT_DATE + INTERVAL 3 DAY,'10:00:00'),16),
(2,3,2,TIMESTAMP(CURRENT_DATE + INTERVAL 4 DAY,'17:00:00'),TIMESTAMP(CURRENT_DATE + INTERVAL 4 DAY,'17:50:00'),12),
(3,1,1,TIMESTAMP(CURRENT_DATE + INTERVAL 5 DAY,'16:00:00'),TIMESTAMP(CURRENT_DATE + INTERVAL 5 DAY,'16:45:00'),14),
(4,2,3,TIMESTAMP(CURRENT_DATE + INTERVAL 5 DAY,'15:00:00'),TIMESTAMP(CURRENT_DATE + INTERVAL 5 DAY,'16:00:00'),1);

UPDATE sessions SET kind="personal" WHERE lesson_id=4;
