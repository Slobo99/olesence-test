# Sintetička UI proba

Ova mala izmena pripada isključivo Slobo99/olesence-test, folderu Oleosence-PostgreSQL-test-setup-compact/isolated-cod-test. Ne menjati produkcioni repo ili postojeći source.zip.

Posle odobrenog deploy-a otvoriti /checkout na postojećem test servisu. Istaknuta oznaka kaže da nema stvarne porudžbine. Kontakt je izmišljen i zaključan. Korpa, potvrda i istorija koriste simulirane odgovore u jednom pregledaču; ne šalju kontakt/order zahtev serveru. CSP blokira mrežne fetch zahteve. Server ne prihvata porudžbine niti omogućava Google prijavu. /healthz i PostgreSQL provere ostaju postojeći tok.

Link „Počni novu probu” briše samo podatke sintetičke probe iz ovog pregledača. Nema stvarne naplate, mejla ni isporuke.

Build dodaje dve provere: ograničene rute/malformed URL i ceo sintetički checkout sa zaključanim kontaktom, pregledom, potvrdom i istorijom. Prava desktop/mobile vizuelna provera sledi tek nakon deploy-a ove izmene. Originalni COD source ZIP i aplikacioni kod ostaju neizmenjeni.
