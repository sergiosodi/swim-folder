// Registra presso Polar l'indirizzo che riceve la notifica "nuovo allenamento".
// Si esegue UNA SOLA VOLTA, dopo aver pubblicato la funzione "polar" su Supabase.
//
// Uso (dalla cartella del progetto):
//   node create-polar-webhook.js CLIENT_ID CLIENT_SECRET https://TUO-PROGETTO.supabase.co/functions/v1/polar
//
// Polar risponde con "signature_secret_key": compare UNA volta sola, copiala subito
// e salvala come segreto POLAR_WEBHOOK_SECRET su Supabase.

const [clientId, clientSecret, url] = process.argv.slice(2);

if (!clientId || !clientSecret || !url) {
  console.error(
    'Uso: node create-polar-webhook.js CLIENT_ID CLIENT_SECRET https://TUO-PROGETTO.supabase.co/functions/v1/polar'
  );
  process.exit(1);
}

(async () => {
  const res = await fetch('https://www.polaraccesslink.com/v3/webhooks', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ events: ['EXERCISE'], url }),
  });

  const text = await res.text();
  console.log('Stato della risposta:', res.status);
  console.log(text);

  if (res.ok) {
    console.log('\nFatto! Copia il valore di "signature_secret_key" qui sopra.');
  } else if (res.status === 409) {
    console.log('\nEsiste già un webhook per questa applicazione.');
  } else {
    console.log(
      '\nNon è andata a buon fine. Controlla che la funzione sia pubblicata con la verifica JWT disattivata.'
    );
  }
})();