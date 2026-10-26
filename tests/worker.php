<?php
require dirname(__DIR__).'/app/bootstrap.php';
try { book((int)$argv[1],(int)$argv[2]); echo 'OK'; }
catch (DomainException $e) { echo 'REJECTED'; }
catch (Throwable $e) { fwrite(STDERR,(string)$e); exit(1); }
