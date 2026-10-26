<?php
function page_header(string $title,?array $u,string $page): void { ?>
<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><?=e($title)?> | Forma Fitness</title><link rel="stylesheet" href="assets/style.css"><script src="assets/app.js" defer></script></head><body>
<a class="skip" href="#content">Přejít na obsah</a>
<header class="topbar"><div class="container navigation"><a href="index.php" class="brand"><span class="brand-icon">F</span> FORMA<span class="brand-small">FITNESS</span></a><nav aria-label="Hlavní navigace">
<?php foreach(['home'=>'Úvod','schedule'=>'Rozvrh','trainers'=>'Trenéři'] as $p=>$label): ?><a class="<?=$page===$p?'selected':''?>" href="index.php?page=<?=$p?>"><?=$label?></a><?php endforeach ?>
<?php if($u): ?><a href="index.php?page=reservations" class="<?=$page==='reservations'?'selected':''?>">Moje rezervace</a><a href="index.php?page=activity">Moje aktivita</a><?php if($u['role']==='admin'): ?><a href="index.php?page=admin" class="admin-link">Administrace</a><?php endif ?><a href="index.php?page=profile"><?=e($u['name'])?></a><form method="post" class="inline"><?php token() ?><input type="hidden" name="action" value="logout"><button class="link-button">Odhlásit</button></form>
<?php else: ?><a href="index.php?page=login">Přihlášení</a><a class="button small" href="index.php?page=register">Vytvořit účet</a><?php endif ?></nav></div></header>
<main id="content" class="container">
<?php if(isset($_SESSION['flash'])): $f=$_SESSION['flash']; unset($_SESSION['flash']); ?><div class="notice <?=e($f['type'])?>" role="status"><?=e($f['text'])?></div><?php endif ?>
<?php }
function page_footer(): void { ?>
</main><footer class="container footer"><span>FORMA FITNESS · Rezervační systém</span><span>Školní projekt · Vojtěch Nováček</span></footer></body></html>
<?php }
function heading(string $kicker,string $title,string $intro=''): void { ?><div class="page-heading"><span class="eyebrow"><?=e($kicker)?></span><h1><?=e($title)?></h1><?php if($intro): ?><p class="muted"><?=e($intro)?></p><?php endif ?></div><?php }
function field(string $name,string $label,string $type='text',$value='',bool $required=true,string $extra=''): void { ?><label><?=e($label)?><input name="<?=e($name)?>" type="<?=e($type)?>" value="<?=e($value)?>" <?=$required?'required':''?> <?=$extra?>></label><?php }
function empty_state(string $text): void { echo '<div class="empty">'.e($text).'</div>'; }
function admin_nav(string $page): void { ?>
<nav class="tabs" aria-label="Administrace"><?php foreach(['admin'=>'Přehled','admin-sessions'=>'Termíny','admin-lessons'=>'Lekce','admin-trainers'=>'Trenéři','admin-users'=>'Uživatelé','admin-reservations'=>'Rezervace a docházka'] as $p=>$label): ?><a class="<?=$p===$page?'selected':''?>" href="index.php?page=<?=$p?>"><?=$label?></a><?php endforeach ?></nav>
<?php }
function action_form(string $action,array $values,string $label,string $class='button small',string $confirm=''): void { ?><form method="post" class="inline" <?= $confirm ? 'data-confirm="'.e($confirm).'"' : '' ?>><?php token() ?><input type="hidden" name="action" value="<?=e($action)?>"><?php foreach($values as $key=>$value): ?><input type="hidden" name="<?=e($key)?>" value="<?=e($value)?>"><?php endforeach ?><button class="<?=e($class)?>"><?=e($label)?></button></form><?php }
function session_cards(array $rows,?array $u): void {
 if(!$rows) { empty_state('Pro tento výběr zatím nejsou vypsané žádné lekce.'); return; }
 $mine=$u ? array_column(all('SELECT session_id FROM reservations WHERE user_id=? AND status="active"',[$u['id']]),'session_id') : [];
 ?><div class="session-grid"><?php foreach($rows as $s): $remaining=(int)$s['capacity']-(int)$s['booked']; ?><article class="card session-card"><div class="card-top"><span class="badge <?=$s['kind']==='personal'?'purple':''?>"><?=$s['kind']==='personal'?'Osobní trénink':'Skupinová lekce'?></span><span class="muted"><?=e($s['duration_minutes'])?> min</span></div><h2><?=e($s['lesson_name'])?></h2><p class="session-description"><?=e($s['description'])?></p><dl class="details"><div><dt>Kdy</dt><dd><?=e(stamp($s['starts_at']))?></dd></div><div><dt>Trenér</dt><dd><?=e($s['trainer_name'])?></dd></div><div><dt>Kde</dt><dd><?=e($s['room_name'])?></dd></div></dl><div class="card-bottom"><span class="<?=$remaining<=0?'danger':'available'?>"><?=$remaining>0?$remaining.' volných míst':'Obsazeno'?></span><?php if(in_array($s['id'],$mine)): ?><span class="badge">Máte rezervováno</span><?php elseif($remaining<=0): ?><button disabled>Obsazeno</button><?php elseif($u): action_form('book',['session_id'=>$s['id']],'Rezervovat'); else: ?><a class="button small" href="index.php?page=login">Přihlásit a rezervovat</a><?php endif ?></div></article><?php endforeach ?></div><?php
}
