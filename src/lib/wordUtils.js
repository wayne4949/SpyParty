export const WordsLibrary = [
    { "id": 1, "wordA": { "zh": "警察", "en": "Police" }, "wordB": { "zh": "保全", "en": "Security Guard" } },
    { "id": 2, "wordA": { "zh": "蘋果", "en": "Apple" }, "wordB": { "zh": "番茄", "en": "Tomato" } },
    { "id": 3, "wordA": { "zh": "鋼筆", "en": "Fountain Pen" }, "wordB": { "zh": "原子筆", "en": "Ballpoint Pen" } },
    { "id": 4, "wordA": { "zh": "筆記型電腦", "en": "Laptop" }, "wordB": { "zh": "平板電腦", "en": "Tablet" } },
    { "id": 5, "wordA": { "zh": "演唱會", "en": "Concert" }, "wordB": { "zh": "音樂劇", "en": "Musical" } },
    { "id": 6, "wordA": { "zh": "腳踏車", "en": "Bicycle" }, "wordB": { "zh": "機車", "en": "Motorcycle" } },
    { "id": 7, "wordA": { "zh": "捷運", "en": "Subway" }, "wordB": { "zh": "公車", "en": "Bus" } },
    { "id": 8, "wordA": { "zh": "咖啡", "en": "Coffee" }, "wordB": { "zh": "紅茶", "en": "Black Tea" } },
    { "id": 9, "wordA": { "zh": "圖書館", "en": "Library" }, "wordB": { "zh": "書店", "en": "Bookstore" } },
    { "id": 10, "wordA": { "zh": "麥克風", "en": "Microphone" }, "wordB": { "zh": "擴音器", "en": "Megaphone" } },
    { "id": 11, "wordA": { "zh": "護理師", "en": "Nurse" }, "wordB": { "zh": "醫師", "en": "Doctor" } },
    { "id": 12, "wordA": { "zh": "漢堡", "en": "Hamburger" }, "wordB": { "zh": "三明治", "en": "Sandwich" } },
    { "id": 13, "wordA": { "zh": "微波爐", "en": "Microwave" }, "wordB": { "zh": "烤箱", "en": "Oven" } },
    { "id": 14, "wordA": { "zh": "游泳池", "en": "Swimming Pool" }, "wordB": { "zh": "海灘", "en": "Beach" } },
    { "id": 15, "wordA": { "zh": "電影院", "en": "Movie Theater" }, "wordB": { "zh": "劇院", "en": "Theater" } },
    { "id": 16, "wordA": { "zh": "太陽眼鏡", "en": "Sunglasses" }, "wordB": { "zh": "近視眼鏡", "en": "Prescription Glasses" } },
    { "id": 17, "wordA": { "zh": "鑰匙", "en": "Key" }, "wordB": { "zh": "密碼", "en": "Password" } },
    { "id": 18, "wordA": { "zh": "錢包", "en": "Wallet" }, "wordB": { "zh": "存錢筒", "en": "Piggy Bank" } },
    { "id": 19, "wordA": { "zh": "戒指", "en": "Ring" }, "wordB": { "zh": "手環", "en": "Bracelet" } },
    { "id": 20, "wordA": { "zh": "貓", "en": "Cat" }, "wordB": { "zh": "狗", "en": "Dog" } },
    { "id": 21, "wordA": { "zh": "鏡子", "en": "Mirror" }, "wordB": { "zh": "玻璃", "en": "Glass" } },
    { "id": 22, "wordA": { "zh": "枕頭", "en": "Pillow" }, "wordB": { "zh": "抱枕", "en": "Cushion" } },
    { "id": 23, "wordA": { "zh": "沐浴乳", "en": "Body Wash" }, "wordB": { "zh": "香皂", "en": "Soap" } },
    { "id": 24, "wordA": { "zh": "牙刷", "en": "Toothbrush" }, "wordB": { "zh": "牙線", "en": "Dental Floss" } },
    { "id": 25, "wordA": { "zh": "衛生紙", "en": "Tissue Paper" }, "wordB": { "zh": "濕紙巾", "en": "Wet Wipe" } },
    { "id": 26, "wordA": { "zh": "筷子", "en": "Chopsticks" }, "wordB": { "zh": "叉子", "en": "Fork" } },
    { "id": 27, "wordA": { "zh": "護照", "en": "Passport" }, "wordB": { "zh": "身分證", "en": "ID Card" } },
    { "id": 28, "wordA": { "zh": "氣球", "en": "Balloon" }, "wordB": { "zh": "泡泡", "en": "Bubble" } },
    { "id": 29, "wordA": { "zh": "巧克力", "en": "Chocolate" }, "wordB": { "zh": "糖果", "en": "Candy" } },
    { "id": 30, "wordA": { "zh": "冰箱", "en": "Refrigerator" }, "wordB": { "zh": "冰櫃", "en": "Freezer" } },
  ];
  
  /**
   * Picks a new word pair avoiding recently played ones.
   * Returns { civilian_word, spy_word, new_played_word_ids }
   */
  export function assignNewWords(roomData) {
    let playedIds = roomData?.played_word_ids || [];
    let pool = WordsLibrary.filter(item => !playedIds.includes(item.id));
  
    if (pool.length === 0) {
      playedIds = [];
      pool = WordsLibrary;
    }
  
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const flip = Math.random() < 0.5;
  
    return {
      civilian_word: flip ? chosen.wordA : chosen.wordB,
      spy_word: flip ? chosen.wordB : chosen.wordA,
      new_played_word_ids: [...playedIds, chosen.id],
    };
  }