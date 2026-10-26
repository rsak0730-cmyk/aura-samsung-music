export interface ConversationalIntent {
  action: 'PLAY' | 'PAUSE' | 'NEXT' | 'PREV' | 'KARAOKE' | 'DRIVE' | 'SLEEP' | 'SPEED' | 'MOOD' | 'SEARCH' | 'UNKNOWN';
  value?: any;
  spokenResponse: string;
}

export class AuraConversationalAssistant {
  private recognition: any = null;
  private isListening = false;
  private onIntentResolved: (intent: ConversationalIntent) => void;

  constructor(onIntentResolved: (intent: ConversationalIntent) => void) {
    this.onIntentResolved = onIntentResolved;
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (Speech) {
      this.recognition = new Speech();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = navigator.language || 'en-US';

      this.recognition.onresult = (e: any) => {
        const spokenSentence = e.results[0][0].transcript;
        const resolved = this.interpretSentence(spokenSentence);
        this.speak(resolved.spokenResponse);
        this.onIntentResolved(resolved);
      };

      this.recognition.onend = () => {
        this.isListening = false;
      };
    }
  }

  public toggle(): boolean {
    if (!this.recognition) {
      this.speak("Speech recognition is not supported on this browser.");
      return false;
    }
    if (this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    } else {
      this.recognition.start();
      this.isListening = true;
    }
    return this.isListening;
  }

  public interpretSentence(text: string): ConversationalIntent {
    const raw = text.toLowerCase();

    if (raw.includes('karaoke') || raw.includes('sing along') || raw.includes('remove vocal') || raw.includes('cut the voice') || raw.includes('take out the singing')) {
      return { action: 'KARAOKE', spokenResponse: "Toggling Karaoke mode and removing center vocals." };
    }

    if (raw.includes('car') || raw.includes('drive') || raw.includes('driving') || raw.includes('road')) {
      return { action: 'DRIVE', spokenResponse: "Drive Mode activated. Switched to high-contrast oversized controls." };
    }

    if (raw.includes('sleep') || raw.includes('bed') || raw.includes('timer') || raw.includes('nap')) {
      const match = raw.match(/\d+/);
      const minutes = match ? parseInt(match[0], 10) : 30;
      return { action: 'SLEEP', value: minutes, spokenResponse: `Sleep timer set for ${minutes} minutes.` };
    }

    if (raw.includes('gym') || raw.includes('workout') || raw.includes('energy') || raw.includes('pump')) {
      return { action: 'MOOD', value: 'Workout', spokenResponse: "Queueing high-energy workout music." };
    }

    if (raw.includes('chill') || raw.includes('relax') || raw.includes('unwind') || raw.includes('calm')) {
      return { action: 'MOOD', value: 'Chill', spokenResponse: "Playing relaxing ambient tracks." };
    }

    if (raw.includes('study') || raw.includes('focus') || raw.includes('read') || raw.includes('concentrate')) {
      return { action: 'MOOD', value: 'Focus', spokenResponse: "Engaging deep focus mode." };
    }

    if (raw.includes('skip') || raw.includes('next')) {
      return { action: 'NEXT', spokenResponse: "Skipping to the next track." };
    }

    if (raw.includes('back') || raw.includes('previous')) {
      return { action: 'PREV', spokenResponse: "Playing the previous track." };
    }

    if (raw.includes('stop') || raw.includes('pause') || raw.includes('wait')) {
      return { action: 'PAUSE', spokenResponse: "Paused." };
    }

    const cleaned = raw.replace(/(can you|please|play|put on|listen to|search for)/g, '').trim();
    if (cleaned.length > 0) {
      return { action: 'SEARCH', value: cleaned, spokenResponse: `Searching for ${cleaned}.` };
    }

    return { action: 'PLAY', spokenResponse: "Resuming playback." };
  }

  public speak(sentence: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }
}