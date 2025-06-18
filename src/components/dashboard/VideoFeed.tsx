
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BadgeInfo, Camera, CameraOff, Maximize, Minimize } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoFeedProps {
  fullWidth?: boolean;
}

const VideoFeed: React.FC<VideoFeedProps> = ({ fullWidth = false }) => {
  const [isLive, setIsLive] = useState(true);
  const [expanded, setExpanded] = useState(false);
  
  return (
    <Card className={cn(
      "col-span-12", 
      expanded ? "md:col-span-12" : fullWidth ? "md:col-span-12" : "md:col-span-8",
      expanded ? "z-10 fixed inset-4 overflow-auto" : ""
    )}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center">
          <Camera className="mr-2 h-5 w-5 text-muted-foreground" />
          Live Camera Feed
        </CardTitle>
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setIsLive(!isLive)}
          >
            {isLive ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative w-full aspect-video bg-black rounded-md overflow-hidden">
          {isLive ? (
            <img 
              src="https://place-hold.it/1280x720/333/fff&text=Camera%20Feed&fontsize=20" 
              alt="Live camera feed"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white">
              <div className="text-center">
                <CameraOff className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">Camera feed paused</p>
              </div>
            </div>
          )}
          
          <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-md flex items-center">
            <div className={`h-2 w-2 rounded-full mr-1 ${isLive ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`}></div>
            {isLive ? 'LIVE' : 'PAUSED'}
          </div>
          
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-md">
            Camera 01 • Main Conveyor
          </div>
          
          {isLive && (
            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-md flex items-center">
              <BadgeInfo className="h-3 w-3 mr-1" />
              1280x720 • 30fps
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default VideoFeed;
