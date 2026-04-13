import React from 'react';

export default function BannerAd() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-secondary/80 backdrop-blur-sm border-t border-border">
      <div className="h-14 flex items-center justify-center">
        <span className="text-xs text-muted-foreground tracking-widest uppercase">AdSense Placeholder</span>
      </div>
    </div>
  );
}