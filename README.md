# Midnimo Academy For Science & Technology

Nidaamkan wuxuu ka kooban yahay portal arday iyo dashboard maamul. Maamulka ayaa abuuri kara akoonnada ardayda, lambar iyo username u samayn kara, password u dejin kara, sawir gelin kara, isla markaana diiwaangelin kara natiijooyinka iyo xaadiriska. Xogta ardaygu waxay ka muuqataa oo keliya akoonkiisa.

## Bilowga

1. Ku rakib Node.js 22.5 ama ka cusub.
2. Fur PowerShell gudaha galka mashruuca, orod `npm install`.
3. Bilow server-ka adigoo ordaya `npm start`.
4. Browser-ka ka fur `http://localhost:3000`.
5. Marka ugu horraysa, samee username iyo password-ka admin-ka. Password-ku ha ka koobnaado ugu yaraan 10 xaraf.
6. Gal dashboard-ka, dooro **Ardayda** → **Ku dar arday**, kadib geli xogta iyo sawirka ardayga.

Maamulka ayaa dejinaya student number, username, iyo password-ka arday kasta, kadibna ardayga si gaar ah ugu gudbinaya. Ardaygu wuxuu isla boggaas kaga galayaa username-kiisa iyo password-kiisa.

## Xogta iyo dejinta server-ka

- SQLite database-ka iyo sawirrada waxaa lagu kaydiyaa galka `data/` ee mashruuca.
- Deji `PORT` si aad u beddesho dekedda (default `3000`).
- Deji `DATA_DIR` si database-ka iyo sawirradu ugu kaydsamaan meel kale oo joogto ah.
- Haddii website-ka internetka la gelinayo, isticmaal HTTPS oo deji `NODE_ENV=production`; habkaas cookie-ga gelitaanku wuxuu adeegsadaa `Secure`.
- Samee kayd-joogto ah oo galka `data/` ah. Ha wadaagin galkaas, sababtoo ah wuxuu xambaarsan yahay xogta ardayda iyo sawirrada.

## Waxa hadda ku jira

- Hal admin oo koowaad la dejiyo marka ugu horraysa; dashboard-ka admin-ku wuxuu maamulaa ardayda.
- Liiska, raadinta, ku darista, wax-ka-beddelka iyo tirtirista ardayda.
- Sawirro JPG, PNG ama WebP ah, cabbirkoodu ugu badnaan yahay 4 MB.
- Dhibco imtixaan 0–100 ah iyo diiwaan xaadiris (joogay, maqnaa, daahay).
- Dashboard gaar ah oo arday kastaa ku arko natiijadiisa, xaadiriskiisa iyo sawirkiisa.
- SQLite, password hashing, session cookies ammaan ah, CSRF token, iyo kala-soocidda awoodaha admin/arday.

Nidaamkan waa bilow diyaar u ah in gudaha lagu tijaabiyo. Kahor isticmaalka xogta ardayda dhabta ah ee internet-ka, ku martigeli server la ilaaliyo oo HTTPS leh, samee backup joogto ah, hana gelin xog tijaabo ah sidii xog rasmi ah.
