const functions = require('firebase-functions');

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
admin.initializeApp();

const translate = require('@google-cloud/translate')();
// List of output languages.
const LANGUAGES = ['en', 'es', 'de', 'fr', 'sv', 'ga', 'it', 'jp'];

// Translate an incoming message.
exports.translate = functions.database.ref('/messages/{languageID}/{messageID}').onWrite((change, context) => {
    const snapshot = change.after;
    if (snapshot.val().translated) {
        return null;
    }
    const promises = [];
    for (let i = 0; i < LANGUAGES.length; i++) {
        const language = LANGUAGES[i];
        if (language !== context.params.languageID) {
            promises.push(translate.translate(snapshot.val().message, {from: context.params.languageID, to: language}).then(
                (results) => {
                    return admin.database().ref(`/messages/${language}/${snapshot.key}`).set({
                        message: results[0],
                        translated: true,
                    });
                }));
        }
    }
    return Promise.all(promises);
});


// Since this code will be running in the Cloud Functions enviornment
// we call initialize Firestore without any arguments because it
// detects authentication from the environment.
const firestore = admin.firestore();

// Create a new function which is triggered on changes to /status/{uid}
// Note: This is a Realtime Database trigger, *not* Cloud Firestore.
exports.onUserStatusChanged = functions.database.ref('/status/{uid}').onUpdate(
    (change, context) => {
        // Get the data written to Realtime Database
        const eventStatus = change.after.val();

        // Then use other event data to create a reference to the
        // corresponding Firestore document.
        const userStatusFirestoreRef = firestore.doc(`status/${context.params.uid}`);

        // It is likely that the Realtime Database change that triggered
        // this event has already been overwritten by a fast change in
        // online / offline status, so we'll re-read the current data
        // and compare the timestamps.
        return change.after.ref.once('value').then((statusSnapshot) => {
            const status = statusSnapshot.val();
            console.log(status, eventStatus);
            // If the current timestamp for this data is newer than
            // the data that triggered this event, we exit this function.
            if (status.last_changed > eventStatus.last_changed) {
                return null;
            }

            // Otherwise, we convert the last_changed field to a Date
            eventStatus.last_changed = new Date(eventStatus.last_changed);

            // ... and write it to Firestore.
            return userStatusFirestoreRef.set(eventStatus);
        });
    });
