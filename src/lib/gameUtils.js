export function generateRoomCode() {
    return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }
  
  export function getSpyCount(playerCount) {
    if (playerCount <= 5) return 1;
    if (playerCount <= 8) return 2;
    return 2;
  }
  
  export function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }