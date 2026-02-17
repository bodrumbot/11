import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDyMSb56lMkFSJwikC0bcnO-mc72TiJs8E",
  authDomain: "bodrum-ca8cd.firebaseapp.com",
  projectId: "bodrum-ca8cd",
  storageBucket: "bodrum-ca8cd.firebasestorage.app",
  messagingSenderId: "823852712330",
  appId: "1:823852712330:web:e377746caec7700296c873",
  measurementId: "G-E2ZRB9P9VM",
  databaseURL: "https://bodrum-ca8cd-default-rtdb.firebaseio.com/" // Muhim: Realtime DB URL
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export { ref, set, push, onValue, update, remove };
