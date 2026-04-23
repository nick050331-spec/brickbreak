"use client";

import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';

const BrickBreaker: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<'START' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'WON'>('START');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [lives, setLives] = useState(3);
  const [playerName, setPlayerName] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const [mascotEmotion, setMascotEmotion] = useState<'normal' | 'happy' | 'sad'>('normal');
  const [leaderboard, setLeaderboard] = useState<{name: string, score: number, time: number}[]>([]);
  const emotionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [volume, setVolume] = useState(0.5);

  useEffect(() => {
    if (audioRef.current) {
      if (gameState === 'PLAYING') {
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
      }
    }
  }, [gameState]);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('https://script.google.com/macros/s/AKfycby72n9NSLrX9tzvd1foprwKBl6kgT60xqrcHFEmGQ7AUF6JkWRQoEQKEN6PSk20DdSm/exec');
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          setLeaderboard(data);
        }
      } catch {
        console.warn("Leaderboard not ready yet or returned HTML");
      }
    } catch (e) {
      console.error("Failed to fetch leaderboard", e);
    }
  };

  const speakText = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    if (gameState === 'COUNTDOWN' && countdown !== null) {
      if (countdown > 0) {
        speakText(countdown.toString());
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(timer);
      } else if (countdown === 0) {
        speakText("시작!");
        setGameState('PLAYING');
        startTimeRef.current = Date.now();
      }
    }
  }, [gameState, countdown]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const playHitSound = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(volume * 2.0, ctx.currentTime); // Sound effect louder
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.error("Audio playback failed", e);
    }
  };

  const saveGameResult = async (finalScore: number, finalTime: number) => {
    try {
      await fetch('https://script.google.com/macros/s/AKfycby72n9NSLrX9tzvd1foprwKBl6kgT60xqrcHFEmGQ7AUF6JkWRQoEQKEN6PSk20DdSm/exec', {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          name: playerName || 'Unknown',
          score: finalScore,
          time: formatTime(finalTime),
        }),
      });
      setTimeout(fetchLeaderboard, 2000);
    } catch (e) {
      console.error('Failed to save score:', e);
    }
  };

  const triggerEmotion = (emotion: 'happy' | 'sad') => {
    setMascotEmotion(emotion);
    if (emotionTimeoutRef.current) clearTimeout(emotionTimeoutRef.current);
    emotionTimeoutRef.current = setTimeout(() => {
      setMascotEmotion('normal');
    }, 1000);
  };

  // Game constants
  const PADDLE_WIDTH = 100;
  const PADDLE_HEIGHT = 12;
  const BALL_RADIUS = 8;
  const BRICK_ROWS = 5;
  const BRICK_COLS = 8;
  const BRICK_PADDING = 10;
  const BRICK_OFFSET_TOP = 60;
  const BRICK_OFFSET_LEFT = 35;
  const BRICK_HEIGHT = 24;

  // Game variables (mutable)
  const gameRef = useRef({
    paddleX: 0,
    ballX: 0,
    ballY: 0,
    dx: 4,
    dy: -4,
    bricks: [] as { x: number; y: number; status: number; color: string }[],
    rightPressed: false,
    leftPressed: false,
    canvasWidth: 800,
    canvasHeight: 600,
    redBricksDestroyed: 0,
    pauseTime: 0,
  });

  const initBricks = () => {
    const bricks = [];
    const nonRedColors = ['#FF8E3C', '#FFD93D', '#6BCB77', '#4D96FF', '#9D4EDD'];
    const RED_COLOR = '#FF3D68';
    for (let c = 0; c < BRICK_COLS; c++) {
      for (let r = 0; r < BRICK_ROWS; r++) {
        const brickWidth = (gameRef.current.canvasWidth - BRICK_OFFSET_LEFT * 2 - (BRICK_COLS - 1) * BRICK_PADDING) / BRICK_COLS;
        
        const isRed = Math.random() < 0.3;
        const color = isRed ? RED_COLOR : nonRedColors[Math.floor(Math.random() * nonRedColors.length)];

        bricks.push({
          x: c * (brickWidth + BRICK_PADDING) + BRICK_OFFSET_LEFT,
          y: r * (BRICK_HEIGHT + BRICK_PADDING) + BRICK_OFFSET_TOP,
          status: 1,
          color: color,
        });
      }
    }
    gameRef.current.bricks = bricks;
  };

  const startGame = () => {
    setScore(100);
    setLives(3);
    setElapsedTime(0);
    setGameState('COUNTDOWN');
    setCountdown(3);
    gameRef.current.paddleX = (gameRef.current.canvasWidth - PADDLE_WIDTH) / 2;
    gameRef.current.ballX = gameRef.current.canvasWidth / 2;
    gameRef.current.ballY = gameRef.current.canvasHeight - 40;
    gameRef.current.dx = 4 * (Math.random() > 0.5 ? 1 : -1);
    gameRef.current.dy = -4;
    gameRef.current.redBricksDestroyed = 0;
    initBricks();
  };

  const togglePause = () => {
    if (gameState === 'PLAYING') {
      setGameState('PAUSED');
      gameRef.current.pauseTime = Date.now();
    } else if (gameState === 'PAUSED') {
      setGameState('PLAYING');
      if (startTimeRef.current && gameRef.current.pauseTime) {
        startTimeRef.current += (Date.now() - gameRef.current.pauseTime);
      }
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameState === 'PLAYING') {
      interval = setInterval(() => {
        if (startTimeRef.current) {
          const t = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setElapsedTime(t);
          setScore(Math.floor(100 / Math.max(t, 1)));
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    gameRef.current.canvasWidth = canvas.width;
    gameRef.current.canvasHeight = canvas.height;
    gameRef.current.paddleX = (canvas.width - PADDLE_WIDTH) / 2;

    const keyDownHandler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'arrowright') gameRef.current.rightPressed = true;
      else if (key === 'arrowleft') gameRef.current.leftPressed = true;
    };

    const keyUpHandler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'arrowright') gameRef.current.rightPressed = false;
      else if (key === 'arrowleft') gameRef.current.leftPressed = false;
    };

    const touchMoveHandler = (e: TouchEvent) => {
      if (gameState === 'PLAYING') {
        e.preventDefault(); // Prevent scrolling while playing
      }
      if (e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const relativeX = touch.clientX - rect.left;
        
        const scaleX = canvas.width / rect.width;
        const canvasX = relativeX * scaleX;

        if (canvasX > 0 && canvasX < canvas.width) {
          gameRef.current.paddleX = canvasX - PADDLE_WIDTH / 2;
        }
      }
    };

    document.addEventListener('keydown', keyDownHandler);
    document.addEventListener('keyup', keyUpHandler);
    canvas.addEventListener('touchmove', touchMoveHandler, { passive: false });

    let animationFrameId: number;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Bricks
      gameRef.current.bricks.forEach((b) => {
        if (b.status === 1) {
          const brickWidth = (canvas.width - BRICK_OFFSET_LEFT * 2 - (BRICK_COLS - 1) * BRICK_PADDING) / BRICK_COLS;
          
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, brickWidth, BRICK_HEIGHT, 4);
          ctx.fillStyle = b.color;
          ctx.fill();
          
          // Highlight
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, brickWidth, BRICK_HEIGHT / 2, 4);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.fill();
          ctx.closePath();

          if (gameState === 'PLAYING') {
            // Collision detection
            if (
              gameRef.current.ballX > b.x &&
              gameRef.current.ballX < b.x + brickWidth &&
              gameRef.current.ballY > b.y &&
              gameRef.current.ballY < b.y + BRICK_HEIGHT
            ) {
              gameRef.current.dy = -gameRef.current.dy;
              b.status = 0;
              playHitSound();
              if (b.color === '#FF3D68') {
                gameRef.current.redBricksDestroyed++;
                triggerEmotion('happy');
              } else {
                triggerEmotion('sad');
              }
            }
          }
        }
      });

      if (gameState === 'PLAYING' && gameRef.current.redBricksDestroyed >= 3) {
        const finalTime = startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current) / 1000) : elapsedTime;
        const finalScore = Math.floor(100 / Math.max(finalTime, 1));
        
        setElapsedTime(finalTime);
        setScore(finalScore);
        setGameState('WON');
        saveGameResult(finalScore, finalTime);
        
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#FF3D68', '#9D4EDD', '#6BCB77', '#4D96FF', '#FFD93D']
        });
      }

      ctx.beginPath();
      ctx.arc(gameRef.current.ballX, gameRef.current.ballY, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#1e293b"; // Dark ball for light theme
      ctx.shadowBlur = 0;
      ctx.shadowColor = "#000000";
      ctx.fill();
      ctx.closePath();

      // Draw Paddle
      ctx.beginPath();
      ctx.roundRect(gameRef.current.paddleX, canvas.height - PADDLE_HEIGHT - 10, PADDLE_WIDTH, PADDLE_HEIGHT, 6);
      const gradient = ctx.createLinearGradient(gameRef.current.paddleX, 0, gameRef.current.paddleX + PADDLE_WIDTH, 0);
      gradient.addColorStop(0, '#4D96FF');
      gradient.addColorStop(1, '#6BCB77');
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.closePath();

      if (gameState === 'PLAYING') {
        // Move Ball
        if (gameRef.current.ballX + gameRef.current.dx > canvas.width - BALL_RADIUS || gameRef.current.ballX + gameRef.current.dx < BALL_RADIUS) {
          gameRef.current.dx = -gameRef.current.dx;
        }
        if (gameRef.current.ballY + gameRef.current.dy < BALL_RADIUS) {
          gameRef.current.dy = -gameRef.current.dy;
        } else if (gameRef.current.ballY + gameRef.current.dy > canvas.height - BALL_RADIUS - 10) {
          if (gameRef.current.ballX > gameRef.current.paddleX && gameRef.current.ballX < gameRef.current.paddleX + PADDLE_WIDTH) {
            // Adjust angle based on where it hits the paddle
            const hitPos = (gameRef.current.ballX - (gameRef.current.paddleX + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
            gameRef.current.dx = hitPos * 5;
            gameRef.current.dy = -gameRef.current.dy;
          } else if (gameRef.current.ballY + gameRef.current.dy > canvas.height - BALL_RADIUS) {
            triggerEmotion('sad');
            setLives((l) => {
              if (l <= 1) {
                const finalTime = startTimeRef.current ? Math.floor((Date.now() - startTimeRef.current) / 1000) : elapsedTime;
                const finalScore = Math.floor(100 / Math.max(finalTime, 1));
                setElapsedTime(finalTime);
                setScore(finalScore);
                setGameState('GAMEOVER');
                saveGameResult(finalScore, finalTime);
                return 0;
              }
              // Reset ball
              gameRef.current.ballX = gameRef.current.paddleX + PADDLE_WIDTH / 2;
              gameRef.current.ballY = canvas.height - PADDLE_HEIGHT - 10 - BALL_RADIUS;
              gameRef.current.dx = 4 * (Math.random() > 0.5 ? 1 : -1);
              gameRef.current.dy = -4;
              return l - 1;
            });
          }
        }

        gameRef.current.ballX += gameRef.current.dx;
        gameRef.current.ballY += gameRef.current.dy;

        // Move Paddle
        if (gameRef.current.rightPressed && gameRef.current.paddleX < canvas.width - PADDLE_WIDTH) {
          gameRef.current.paddleX += 7;
        } else if (gameRef.current.leftPressed && gameRef.current.paddleX > 0) {
          gameRef.current.paddleX -= 7;
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      document.removeEventListener('keydown', keyDownHandler);
      document.removeEventListener('keyup', keyUpHandler);
      canvas.removeEventListener('touchmove', touchMoveHandler);
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameState]);

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const renderLeaderboard = () => {
    if (leaderboard.length === 0) return null;
    return (
      <div className="mt-4 mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl max-w-xs mx-auto">
        <h3 className="text-sm font-bold text-slate-500 mb-3 flex items-center justify-center gap-2">
          🏆 최단 시간 TOP 3 🏆
        </h3>
        <div className="flex flex-col gap-2 text-sm">
          {leaderboard.map((entry, idx) => (
            <div key={idx} className="flex justify-between items-center bg-white px-3 py-2 rounded shadow-sm border border-gray-100">
              <span className="font-bold text-slate-700 w-6 text-center">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
              <span className="font-medium text-slate-800 flex-1 truncate px-2 text-left">{entry.name}</span>
              <span className="font-mono font-bold text-blue-600">
                {typeof entry.time === 'number' ? formatTime(entry.time) : entry.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-2 md:p-4 font-sans text-slate-900 w-full overflow-hidden box-border">
      <audio ref={audioRef} src="/Hyper_Speed_Run.mp3" loop />
      <div className="relative group w-full max-w-[800px] mx-auto">
        {/* Glow effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-emerald-300 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
        
        <div className="relative bg-white rounded-xl overflow-hidden border border-gray-200 shadow-2xl w-full box-border">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-white/80 backdrop-blur-md border-b border-gray-200 gap-3 md:gap-4">
            
            {/* Top row for mobile: Score, Time & Lives */}
            <div className="flex w-full justify-between items-center md:hidden">
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Score</span>
                  <span className="text-slate-900 text-lg font-black tabular-nums">{score}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Time</span>
                  <span className="text-slate-900 text-lg font-black tabular-nums">{formatTime(elapsedTime)}</span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Lives</span>
                <div className="flex gap-1 mt-1">
                  {[...Array(3)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${i < lives ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-gray-200'}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Desktop Left: Score & Time */}
            <div className="hidden md:flex items-center gap-8">
              <div className="flex flex-col">
                <span className="text-slate-500 text-xs uppercase tracking-widest font-bold">Score</span>
                <span className="text-slate-900 text-2xl font-black tabular-nums">{score}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-slate-500 text-xs uppercase tracking-widest font-bold">Time</span>
                <span className="text-slate-900 text-2xl font-black tabular-nums">{formatTime(elapsedTime)}</span>
              </div>
            </div>
            
            {/* Center: Title & Buttons */}
            <div className="flex flex-col items-center gap-2 mt-2 md:mt-0">
              <h1 className="text-base md:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-emerald-500 text-center">
                INU 벽돌깨기
              </h1>
              
              {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
                <div className="flex flex-wrap justify-center gap-2">
                  <button onClick={togglePause} className="px-3 md:px-4 py-1 md:py-1.5 bg-gray-100 hover:bg-gray-200 text-slate-700 text-[10px] md:text-sm font-bold rounded-full transition-colors border border-gray-300 whitespace-nowrap">
                    {gameState === 'PLAYING' ? 'PAUSE' : 'RESUME'}
                  </button>
                  <button onClick={() => setGameState('START')} className="px-3 md:px-4 py-1 md:py-1.5 bg-gray-100 hover:bg-red-100 text-red-500 hover:text-red-600 text-[10px] md:text-sm font-bold rounded-full transition-colors border border-gray-300 whitespace-nowrap">
                    RESTART
                  </button>
                </div>
              )}
            </div>

            {/* Desktop Right: Vol & Lives */}
            <div className="hidden md:flex items-center gap-6">
              <div className="flex flex-col items-center">
                <span className="text-slate-500 text-xs uppercase tracking-widest font-bold mb-1">Vol</span>
                <input 
                  type="range" min="0" max="1" step="0.01" 
                  value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-16 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-slate-500 text-xs uppercase tracking-widest font-bold">Lives</span>
                <div className="flex gap-1 mt-1">
                  {[...Array(3)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-3 h-3 rounded-full transition-all duration-300 ${i < lives ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-gray-200'}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile Vol */}
            <div className="flex md:hidden items-center justify-center w-full mt-1">
              <span className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mr-2">Vol</span>
              <input 
                type="range" min="0" max="1" step="0.01" 
                value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-32 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>

          <div className="relative w-full flex justify-center">
            <canvas
              ref={canvasRef}
              className="block bg-transparent cursor-none touch-none w-full max-w-full"
              style={{ touchAction: 'none' }}
            />
          </div>

          {gameState === 'PLAYING' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0">
              <img 
                src="/Mascot.jpg" 
                alt="횃불이" 
                className={`w-48 h-48 md:w-80 md:h-80 object-contain transition-all duration-300 animate-float rounded-2xl shadow-xl ${
                  mascotEmotion === 'happy' ? 'scale-110 brightness-110 drop-shadow-[0_0_30px_rgba(255,217,61,0.5)]' :
                  mascotEmotion === 'sad' ? 'scale-90 grayscale opacity-40' : 'opacity-80'
                }`}
              />
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={800}
            height={500}
            className="cursor-none block relative z-10"
          />

          {/* Overlay Screens */}
          {gameState !== 'PLAYING' && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-10">
              <div className="text-center p-6 md:p-8 bg-white rounded-2xl border border-gray-200 shadow-2xl animate-in zoom-in duration-300 w-11/12 max-w-md mx-auto">
                {gameState === 'START' && (
                  <>
                    <div className="mb-4 md:mb-6 flex justify-center">
                      <img src="/Mascot.jpg" alt="횃불이" className="w-24 h-24 md:w-40 md:h-40 object-contain animate-dance drop-shadow-[0_0_15px_rgba(0,0,0,0.1)] rounded-2xl shadow-lg" />
                    </div>
                    <h2 className="text-3xl md:text-4xl font-black text-slate-900 mb-2">INU 벽돌깨기</h2>
                    <p className="text-slate-600 mb-4 max-w-xs mx-auto text-xs md:text-sm">
                      Use Arrow Keys or Swipe to move the paddle. Destroy 3 RED bricks to win!
                    </p>
                    <p className="text-blue-500 font-bold mb-4 text-xs md:text-sm">
                      영어교육과 202402110 정현우
                    </p>
                    <input
                      type="text"
                      placeholder="Enter your name"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      className="w-full max-w-xs px-4 py-2 mb-8 bg-gray-50 border border-gray-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-center"
                    />
                    <button
                      onClick={startGame}
                      className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-blue-600/30"
                    >
                      START GAME
                    </button>
                  </>
                )}

                {gameState === 'COUNTDOWN' && (
                  <div className="py-12">
                    <h2 className="text-9xl font-black text-blue-600 animate-ping drop-shadow-2xl">
                      {countdown !== 0 ? countdown : 'GO!'}
                    </h2>
                  </div>
                )}

                {gameState === 'PAUSED' && (
                  <>
                    <h2 className="text-4xl font-black text-slate-900 mb-2">PAUSED</h2>
                    <p className="text-slate-600 mb-8">게임이 일시 정지되었습니다.</p>
                    <button
                      onClick={togglePause}
                      className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-blue-600/30"
                    >
                      RESUME
                    </button>
                  </>
                )}
                
                {gameState === 'GAMEOVER' && (
                  <>
                    <h2 className="text-4xl font-black text-red-500 mb-2">GAME OVER</h2>
                    <p className="text-slate-600 mb-2">Final Score: {score}</p>
                    <p className="text-red-500 font-bold text-lg mb-4">게임 미션 실패!</p>
                    {renderLeaderboard()}
                    <div className="mb-8 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 w-full animate-pulse" />
                    </div>
                    <div className="flex gap-4 justify-center">
                      <button
                        onClick={() => setGameState('START')}
                        className="px-8 py-3 bg-gray-100 text-slate-900 border border-gray-300 rounded-full font-bold hover:bg-gray-200 transition-all transform hover:scale-105 active:scale-95"
                      >
                        RESTART
                      </button>
                    </div>
                  </>
                )}

                {gameState === 'WON' && (
                  <>
                    <h2 className="text-4xl font-black text-emerald-500 mb-2">VICTORY!</h2>
                    <p className="text-slate-600 mb-2">You destroyed 3 red bricks! Score: {score}</p>
                    <p className="text-slate-600 mb-4">소요 시간: {formatTime(elapsedTime)}</p>
                    {renderLeaderboard()}
                    <div className="flex gap-4 justify-center">
                      <button
                        onClick={() => setGameState('START')}
                        className="px-8 py-3 bg-emerald-500 text-white rounded-full font-bold hover:bg-emerald-400 transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-emerald-500/30"
                      >
                        RESTART
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Controls Hint */}
        <div className="mt-4 flex flex-wrap justify-center items-center gap-4 md:gap-8 text-slate-600 text-[10px] md:text-sm font-medium px-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <kbd className="px-2 py-1 bg-gray-200 rounded border border-gray-300 text-slate-700">←</kbd>
            <kbd className="px-2 py-1 bg-gray-200 rounded border border-gray-300 text-slate-700">→</kbd>
            <span>Move Paddle</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 md:w-5 md:h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"></path>
            </svg>
            <span>Touch / Swipe</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrickBreaker;
