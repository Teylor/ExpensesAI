import { describe, expect, it } from "vitest";
import {
  createWebSpeechVoiceProvider,
  type SpeechRecognitionLike,
} from "./speech.js";

describe("WebSpeechVoiceProvider (Free Web Speech API ES/EN + graceful degradation)", () => {
  it("reports unsupported cleanly when browser lacks SpeechRecognition (e.g. Firefox)", () => {
    const provider = createWebSpeechVoiceProvider(undefined);
    expect(provider.isSupported()).toBe(false);
    expect(() =>
      provider.start({
        locale: "es",
        onTranscript: () => {},
        onError: () => {},
        onEnd: () => {},
      }),
    ).not.toThrow();
  });

  it("maps locale to BCP-47 (es-ES / en-US), captures transcripts, and stops Push-to-Talk cleanly", () => {
    const instances: FakeRecognition[] = [];

    class FakeRecognition implements SpeechRecognitionLike {
      lang = "";
      continuous = false;
      interimResults = false;
      started = false;
      stopped = false;
      onresult: SpeechRecognitionLike["onresult"] = null;
      onerror: SpeechRecognitionLike["onerror"] = null;
      onend: SpeechRecognitionLike["onend"] = null;

      constructor() {
        instances.push(this);
      }

      start() {
        this.started = true;
      }
      stop() {
        this.stopped = true;
        this.onend?.();
      }
    }

    const provider = createWebSpeechVoiceProvider(() => new FakeRecognition());
    expect(provider.isSupported()).toBe(true);

    const transcripts: string[] = [];
    let ended = false;

    provider.start({
      locale: "es",
      onTranscript: (text) => transcripts.push(text),
      onError: () => {},
      onEnd: () => {
        ended = true;
      },
    });

    const instance = instances[0];
    expect(instance).toBeDefined();
    if (!instance) throw new Error("Expected FakeRecognition instance");
    expect(instance.lang).toBe("es-ES");
    expect(instance.started).toBe(true);

    instance.onresult?.({
      results: [[{ transcript: "Nuevo ingreso de 2000 euros" }]],
    });
    expect(transcripts).toEqual(["Nuevo ingreso de 2000 euros"]);

    provider.stop();
    expect(instance.stopped).toBe(true);
    expect(ended).toBe(true);
  });
});
