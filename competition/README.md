# Gestione della Winter Preseason Cup

Il sito sul dominio principale è pubblicato da GitHub Pages. Il pannello e l'API sono ospitati dal Worker del progetto Winter. Il dominio principale legge esclusivamente l'API pubblica. Accedere al pannello con l'account ChatGPT dell'organizzatore.

## Dopo una partita

1. Selezionare la partita e inserire il punteggio finale. Inserire anche il parziale se riportato.
2. Registrare ogni gol, assist e cartellino selezionando il giocatore nella rosa. Se il referto disciplina è completo, spuntare il campo corrispondente.
3. Aprire l'anteprima e omologare. Verificare risultato e classifica sul sito pubblico.
4. Per una correzione, riaprire la partita, modificare il referto e pubblicare una nuova revisione. La cronologia conserva le revisioni precedenti e i riferimenti dei giocatori.

## Test

Preparare il Worker in una copia di lavoro separata con `bash competition/scripts/prepare-winter.sh /percorso/checkout-worker`. Nella copia eseguire `node scripts/build.mjs`. Dal repository impostare `WINTER_WORKER_ARTIFACT` al percorso assoluto di `dist/server/index.js` ed eseguire `node --test competition/test/competition.test.mjs`. I test usano un database volatile.

## Backup e ripristino

Dal pannello scaricare il backup JSON dopo le giornate e conservarlo in uno spazio accessibile agli organizzatori. Include gli eventi, le revisioni e le note interne.

Per provare il ripristino usare un D1 separato e vuoto. Applicare prima la migrazione dello schema, quindi convertire il backup con `python3 competition/scripts/backup-to-sql.py winter backup.json ripristino.sql`. Importare lo SQL nel database di prova e verificare partite, rose, classifica e conteggi. Un database con dati preesistenti produce un conflitto. Per una correzione di una singola partita usare la cronologia e pubblicare una nuova revisione.

In caso di regressione del sito pubblico, creare un commit di revert del rilascio GitHub Pages. Per il Worker ripubblicare la versione precedente dal progetto Sites. Questo passaggio non ripristina i dati. Per spostare la produzione su un database ripristinato, occorre accesso al provisioning del database e al binding del Worker.
