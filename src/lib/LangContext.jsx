import React, { createContext, useContext, useState } from 'react';

const translations = {
  'zh-TW': {
    // App title
    appTitle: '誰是臥底',
    appSubtitle: '社交推理派對遊戲',

    // Home page
    yourNickname: '你的暱稱',
    nicknamePlaceholder: '輸入暱稱...',
    createRoom: '建立房間',
    joinRoom: '加入房間',
    confirmCreate: '確認建立房間',
    creating: '建立中...',
    joining: '加入中...',
    confirmJoin: '加入房間',
    back: '返回',
    roomCodePlaceholder: '輸入4位數房間代碼',
    roomNotFound: '找不到房間，請確認房間代碼',
    gameAlreadyStarted: '遊戲已經開始，無法加入',
    createFailed: '建立房間失敗：',
    joinFailed: '加入房間失敗：',

    // Lobby
    roomCode: '房間代碼',
    copyCode: '點擊複製代碼分享給朋友',
    copied: '已複製！',
    playersJoined: '位玩家已加入',
    startGame: '開始遊戲',
    waitingForHost: '等待房主開始遊戲...',
    needMorePlayers: '至少需要 4 位玩家才能開始（目前',
    confirmLeave: '確定要離開房間嗎？',

    // Speaking phase
    round: '第',
    roundSuffix: '輪',
    speakingPhase: '描述階段',
    yourWord: '你的詞語',
    eliminated: '已淘汰',
    speakingInstruction: '輪流用一句話描述你的詞語，不要直接說出詞語！',
    alivePlayers: '存活玩家',
    startVoting: '進入投票',
    waitingForVote: '等待房主開啟投票...',

    // Voting phase
    votingPhase: '投票淘汰',
    playersVoted: '位玩家已投票',
    youreEliminated: '你已被淘汰，等待投票結束...',
    voted: '已投票，等待其他玩家...',
    chooseSpy: '選擇你認為的臥底',
    confirmVote: '確認投票',
    voting: '投票中...',

    // Game Over
    spiesWin: '🕵️ 臥底獲勝！',
    civiliansWin: '🎉 平民獲勝！',
    civilianWord: '平民詞語',
    spyWord: '臥底詞語',
    roleReveal: '身份揭曉',
    spy: '臥底',
    civilian: '平民',
    eliminatedBadge: '淘汰',
    playAgain: '再玩一局',

    // Rules modal
    rulesTitle: '遊戲規則',
    rule1: '每位玩家都會得到一個詞語，但臥底的詞語和平民不同。',
    rule2: '輪流用一句話描述你的詞語，不要直接說出來！',
    rule3: '描述結束後投票，淘汰你認為的臥底。',

    // Host disconnect
    hostLeft: '房主已解散房間。',
  },
  en: {
    appTitle: 'Who is the Spy',
    appSubtitle: 'Social Deduction Party Game',

    yourNickname: 'Your Nickname',
    nicknamePlaceholder: 'Enter nickname...',
    createRoom: 'Create Room',
    joinRoom: 'Join Room',
    confirmCreate: 'Confirm Create Room',
    creating: 'Creating...',
    joining: 'Joining...',
    confirmJoin: 'Join Room',
    back: 'Back',
    roomCodePlaceholder: 'Enter 4-digit room code',
    roomNotFound: 'Room not found. Please check the room code.',
    gameAlreadyStarted: 'Game already started. Cannot join.',
    createFailed: 'Failed to create room: ',
    joinFailed: 'Failed to join room: ',

    roomCode: 'Room Code',
    copyCode: 'Tap to copy and share with friends',
    copied: 'Copied!',
    playersJoined: 'players joined',
    startGame: 'Start Game',
    waitingForHost: 'Waiting for host to start...',
    needMorePlayers: 'Need at least 4 players to start (current',
    confirmLeave: 'Are you sure you want to leave?',

    round: 'Round',
    roundSuffix: '',
    speakingPhase: 'Description Phase',
    yourWord: 'Your Word',
    eliminated: 'Eliminated',
    speakingInstruction: 'Take turns describing your word in one sentence — do not say it directly!',
    alivePlayers: 'Alive Players',
    startVoting: 'Start Voting',
    waitingForVote: 'Waiting for host to open voting...',

    votingPhase: 'Vote Out',
    playersVoted: 'players voted',
    youreEliminated: 'You are eliminated. Waiting for voting to end...',
    voted: 'Voted! Waiting for others...',
    chooseSpy: 'Choose who you think is the spy',
    confirmVote: 'Confirm Vote',
    voting: 'Voting...',

    spiesWin: '🕵️ Spies Win!',
    civiliansWin: '🎉 Civilians Win!',
    civilianWord: 'Civilian Word',
    spyWord: 'Spy Word',
    roleReveal: 'Role Reveal',
    spy: 'Spy',
    civilian: 'Civilian',
    eliminatedBadge: 'Out',
    playAgain: 'Play Again',

    rulesTitle: 'Game Rules',
    rule1: 'Every player gets a word, but the spy\'s word is slightly different from the civilians\'.',
    rule2: 'Take turns describing your word in one sentence — don\'t say it directly!',
    rule3: 'After descriptions, vote to eliminate who you think is the spy.',

    hostLeft: 'The host has disbanded the room.',
  },
};

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState('zh-TW');
  const t = translations[lang];
  const toggleLang = () => setLang(l => l === 'zh-TW' ? 'en' : 'zh-TW');

  return (
    <LangContext.Provider value={{ lang, t, toggleLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}