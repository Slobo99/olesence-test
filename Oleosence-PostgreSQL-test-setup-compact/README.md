# Izolovani PostgreSQL test — priprema, još nije izvršeno

Ovaj paket ne objavljuje prodavnicu. Priprema zasebnu privremenu bazu i mali test servis. Potrebno je posebno odobrenje kreiranja resursa, povezivanja i pokretanja na Renderu. Ne koristiti postojeću produkcionu bazu, njen URL, Google konfiguraciju ili stvarne kupce.

## Predloženo postavljanje nakon odobrenja

1. Raspakovati SPOLJNI paket `Oleosence-PostgreSQL-test-setup-compact.zip`. Unutrašnji `isolated-cod-test/source.zip` ostaviti zatvoren: runner ga koristi za proveru originala, folder `app` se automatski pravi tokom build-a nakon provere originalnog ZIP-a. Napraviti zaseban GitHub repozitorijum za ovaj test i u njega učitati raspakovani sadržaj ZIP-a, sa folderom `isolated-cod-test`. U GitHub Upload files prevući ceo folder `isolated-cod-test` i prateće README/VALIDATION datoteke, pa proveriti da putanja `isolated-cod-test/render.yaml` postoji pre commita. Ne slati samo spoljni ZIP. Zaseban repo sprečava slučajno automatsko objavljivanje postojeće prodavnice pri uploadu.
2. U Renderu izabrati New → Blueprint, povezati taj novi repo i navesti Blueprint Path `isolated-cod-test/render.yaml`.
3. Pre potvrde proveriti da su prikazana samo DVA NOVA resursa: `olesence-cod-test-db-20261017` i `olesence-cod-test-runner-20261017`, oba Free, Oregon. Ako imena već postoje, ako se nudi plaćeni plan ili promena postojeće prodavnice, zaustaviti se. Ne preimenovati samo jedan deo konfiguracije: naziv baze/korisnika su namerne sigurnosne provere.
4. Blueprint povezuje samo novu bazu kroz `fromDatabase`. Ne kopirati konekcioni string u kod/chat. Ne uključuje se javni pristup PostgreSQL bazi (`ipAllowList: []`). Javni servis izlaže isključivo `/healthz` sa sažetim test rezultatima, bez kontakata ili kredencijala.
5. Build prvo pokreće `node prepare-source.mjs` (provera i raspakivanje izvora), zatim `npm ci --ignore-scripts --no-audit --no-fund` i svih 149 postojećih testova. Start pokreće `node run.mjs`. Pročitati log i `/healthz`: samo završno `state: passed` uz četiri provere `passed` znači uspešan novi test. `starting`/`running` ili samo zdrav servis nisu uspešan rezultat.
6. Nakon čuvanja rezultata dogovoriti uklanjanje samo ova dva test resursa. Paket ništa automatski ne briše i ne prelazi na plaćeni plan. Isključena je automatska objava na commit, ali restart Free servisa ponovo pokreće test u novoj izolovanoj šemi.

## Šta se proverava

Runner proverava SHA-256 originalnog COD ZIP-a i sve datoteke njegovog manifesta. Izvorni kod u `app` nije izmenjen. Dozvoljava samo eksplicitni test flag, očekivano ime baze i korisnika, Render PostgreSQL host i bazu bez postojećih tabela u javnoj šemi. Svaki pokušaj pravi novu jedinstvenu šemu sa sintetičkim podacima; nema DROP/TRUNCATE/brisanja ni čitanja produkcionih podataka.

Za last-unit, isti idempotency ključ i import/order sukob jedna konekcija drži zaključavanje dok dve druge stvarne PostgreSQL sesije ne čekaju na zaključavanje. Tek onda se barijera pušta i proverava rezultat. Rollback test namerno prekida izvršavanje odmah posle upisa stanja i proverava da porudžbina, stavke i umanjenje nisu sačuvani. Konkurentna primena uvoza zadržava korisnikov dogovoreni model apsolutne zamene stanja, uz odbijanje stare verzije.

Uspeh ovog paketa nije provera kompletnog javnog checkout-a, mobilnog prikaza, kurira, fiskalizacije ili pravnih uslova. Postojeće poručivanje ostaje isključeno dok se posebno ne odobri aktivacija.

## Trošak i ograničenja

Predlog zahteva raspoloživo mesto za Free PostgreSQL i Free web servis. Proveriti ponudu i limit naloga u Renderu pre potvrde; paket ne odobrava trošak. Free baza ima 1 GB, ističe nakon 30 dana, nema backup i nije pogodna za stvarne porudžbine. Dokumentacija navodi dodatni rok od 14 dana za nadogradnju pre brisanja; ovaj paket ne odobrava nadogradnju. Free servisi dele mesečne sate naloga i mogu uspavati servis; prekoračenja build/bandwidth limita mogu nositi trošak, pa pre kreiranja proveriti dostupnu kvotu i prikaz cene; test servis zato ne ostavljati nepotrebno aktivan. Ne uključivati plaćene nadogradnje.

Zvanična dokumentacija:
- Blueprint polja i prilagođena putanja: https://render.com/docs/blueprint-spec
- Postavljanje Blueprint-a: https://render.com/docs/infrastructure-as-code
- Free ograničenja: https://render.com/docs/free
- JSON schema: https://render.com/schema/render.yaml.json

## Trenutni rezultat

Paket je pripremljen lokalno. Sintaksa runner-a i četiri lokalne provere odbijanja neispravne konfiguracije prošle su; one ne proveravaju PostgreSQL transakcije. Stvarni PostgreSQL testovi još NISU izvršeni; Render resursi nisu kreirani. Prethodni COD paket imao je 149/149 lokalnih testova, uz PGlite i jsdom. Desktop prikaz isključenog checkout-a jeste pregledan; mobilni i aktivni checkout tok nisu potvrđeni ovim paketom.
