import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function InterstitialAd({ show, onComplete }) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!show) {
      setCountdown(3);
      return;
    }
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onComplete();
          return 3;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [show, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center"
        >
          <div className="w-full max-w-sm px-6 text-center space-y-8">
            <div className="w-full h-64 rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
              <span className="text-sm text-muted-foreground tracking-widest uppercase">
                AdSense Placeholder
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">廣告將在 {countdown} 秒後關閉</p>
              <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 3, ease: 'linear' }}
                  key={show ? 'active' : 'inactive'}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}