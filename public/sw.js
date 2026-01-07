self.addEventListener("install", () => {
    self.skipWaiting();
  });
  
  self.addEventListener("activate", () => {
    self.clients.claim();
  });
  
  // ONLINE ONLY – no caching
  