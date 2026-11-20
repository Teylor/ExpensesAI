import type { SupportedLocale } from "@agenticf/domain";

export interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}

export interface SpeechRecognitionEventLike {
  readonly results: ArrayLike<ArrayLike<SpeechRecognitionAlternativeLike>>;
}

export interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface VoiceStartCallbacks {
  readonly locale: SupportedLocale;
  readonly onTranscript: (transcript: string) => void;
  readonly onError: (errorCode: string) => void;
  readonly onEnd: () => void;
}

/**
 * Interfaz desacoplada para entrada de voz (V1: Web Speech API 0 €, V2-06: faster-whisper / OpenAI STT).
 */
export interface VoiceInputProvider {
  isSupported(): boolean;
  start(callbacks: VoiceStartCallbacks): void;
  stop(): void;
}

function localeToBcp47(locale: SupportedLocale): string {
  return locale === "en" ? "en-US" : "es-ES";
}

export function createWebSpeechVoiceProvider(
  factory?: () => SpeechRecognitionLike,
): VoiceInputProvider {
  let activeRecognition: SpeechRecognitionLike | null = null;

  return {
    isSupported() {
      return typeof factory === "function";
    },
    start(callbacks) {
      if (!factory) {
        callbacks.onError("speech_unsupported");
        callbacks.onEnd();
        return;
      }

      if (activeRecognition) {
        try {
          activeRecognition.stop();
        } catch {
          // ignore stop error
        }
      }

      const instance = factory();
      instance.lang = localeToBcp47(callbacks.locale);
      instance.continuous = false;
      instance.interimResults = false;

      instance.onresult = (event) => {
        const parts: string[] = [];
        for (let i = 0; i < event.results.length; i += 1) {
          const item = event.results[i]?.[0]?.transcript;
          if (item) parts.push(item.trim());
        }
        const combined = parts.join(" ").trim();
        if (combined) {
          callbacks.onTranscript(combined);
        }
      };

      instance.onerror = (event) => {
        callbacks.onError(event.error || "speech_error");
      };

      instance.onend = () => {
        activeRecognition = null;
        callbacks.onEnd();
      };

      activeRecognition = instance;
      instance.start();
    },
    stop() {
      if (activeRecognition) {
        try {
          activeRecognition.stop();
        } catch {
          // ignore
        }
        activeRecognition = null;
      }
    },
  };
}

export function createBrowserVoiceProvider(): VoiceInputProvider {
  if (typeof window === "undefined") {
    return createWebSpeechVoiceProvider(undefined);
  }
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
  return createWebSpeechVoiceProvider(Ctor ? () => new Ctor() : undefined);
}
