import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnitPracticeScope } from '@/types';
import { lineId, scopedDialogues } from '@/services/practice';
import { ArabicText } from '@/components';
import { content } from '@/content';
import { useReachedUnits } from '@/modules/units/useReachedUnits';
import { speakArabic, isTtsSupported } from '@/services/speech';
import {
  AsrAssessor,
  BrowserAssessor,
  isRecognitionSupported,
  SpeechApi,
  type AssessOutcome,
  type Assessment,
} from '@/services/speech';
import {
  createRecorder,
  EmptyRecordingError,
  isRecordingSupported,
  type ActiveRecorder,
  type Recording,
} from '@/services/audio';
import { isIOS, isStandalonePwa } from '@/services/platform';
import { SharingApi, type ShareTarget } from '@/services/sharing/sharingApi';
import { LetterFeedback } from './LetterFeedback';
import { ShareRecording } from './ShareRecording';
import { MinimalPairDrill } from './MinimalPairDrill';
import { recognitionHelp, recorderHelp, type HelpContext } from './speechHelp';

type Tab = 'shadowing' | 'phonologie';

/**
 * Speaking practice. With a `scope` (inside a unit) shadowing uses only that unit's (or section's)
 * dialogue lines; a line counts once the learner recorded it or had it scored. `speechApi`
 * rates recordings on the server when the learner's classes allow it; `sharingApi` shares a
 * recording with the class teacher (tests pass fakes).
 */
export function Speaking({
  scope,
  speechApi,
  sharingApi,
}: { scope?: UnitPracticeScope; speechApi?: SpeechApi; sharingApi?: SharingApi } = {}) {
  const { t } = useTranslation('speaking');
  const api = useMemo(() => speechApi ?? new SpeechApi(), [speechApi]);
  const sharing = useMemo(() => sharingApi ?? new SharingApi(), [sharingApi]);
  const [tab, setTab] = useState<Tab>('shadowing');
  const { keep } = useReachedUnits();
  // Outside a unit: the dialogue lines of every unit reached so far.
  const lines = useMemo(
    () =>
      (scope
        ? scopedDialogues(content.dialoge, scope)
        : content.dialoge.filter(keep)
      ).flatMap((d) => d.zeilen.map((z, i) => ({ ...z, id: lineId(d.id, i) }))),
    [scope, keep]
  );
  return (
    <div className="stack">
      {!scope && <h1 style={{ margin: 0 }}>{t('title')}</h1>}
      <div className="row">
        <button
          className={`btn ${tab === 'shadowing' ? 'btn-accent' : ''}`}
          onClick={() => setTab('shadowing')}
        >
          {t('tabs.shadowing')}
        </button>
        <button
          className={`btn ${tab === 'phonologie' ? 'btn-accent' : ''}`}
          onClick={() => setTab('phonologie')}
        >
          {t('tabs.phonology')}
        </button>
      </div>
      {tab === 'shadowing' ? (
        lines.length > 0 ? (
          <Shadowing
            api={api}
            sharing={sharing}
            lines={lines}
            isPractised={(id) => scope?.isPractised?.(id) ?? false}
            onPractised={(id) => scope?.onPractised(id)}
          />
        ) : (
          <p className="muted">{t('noLines')}</p>
        )
      ) : (
        <MinimalPairDrill />
      )}
    </div>
  );
}

interface ShadowLine {
  id: string;
  ar: string;
  de: string;
}

/** Whether the server may rate this learner's recordings (false offline or signed out). */
function useServerSpeech(api: SpeechApi): boolean {
  const [server, setServer] = useState(false);
  useEffect(() => {
    let alive = true;
    void api.settings().then((result) => {
      if (alive) setServer(result.ok && result.value.server);
    });
    return () => {
      alive = false;
    };
  }, [api]);
  return server;
}

/** Classes the learner could share recordings with (none when signed out or offline). */
function useShareTargets(api: SharingApi): ShareTarget[] {
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  useEffect(() => {
    let alive = true;
    void api.mine().then((result) => {
      if (alive && result.ok) setTargets(result.value.targets);
    });
    return () => {
      alive = false;
    };
  }, [api]);
  return targets;
}

function Shadowing({
  api,
  sharing,
  lines,
  isPractised,
  onPractised,
}: {
  api: SpeechApi;
  sharing: SharingApi;
  lines: ShadowLine[];
  isPractised(lineId: string): boolean;
  onPractised(lineId: string): void;
}) {
  const { t } = useTranslation('speaking');
  // Continue with the first sentence not done yet (or the first one when all are done).
  const [i, setI] = useState(() =>
    Math.max(
      0,
      lines.findIndex((l) => !isPractised(l.id))
    )
  );
  // Done in this sitting, shown right away (the store catches up asynchronously).
  const [doneNow, setDoneNow] = useState<ReadonlySet<string>>(new Set());
  const [rate, setRate] = useState(0.9);
  // The sentence a recording belongs to is fixed when it starts (navigation is locked too).
  const [recording, setRecording] = useState<{
    recorder: ActiveRecorder;
    lineId: string;
  } | null>(null);
  const [recorded, setRecorded] = useState<{
    lineId: string;
    url: string;
    recording: Recording;
  } | null>(null);
  // Tied to its sentence: a late answer never shows under another one.
  const [score, setScore] = useState<{
    lineId: string;
    assessment: Assessment;
    /** The recording it rated (server), or null for live speech in the browser. */
    recordingUrl: string | null;
  } | null>(null);
  const server = useServerSpeech(api);
  const shareTargets = useShareTargets(sharing);
  const asr = useMemo(() => new AsrAssessor(api), [api]);
  const browser = useMemo(() => new BrowserAssessor(), []);
  const [scoring, setScoring] = useState(false);
  const [recordHint, setRecordHint] = useState<string | null>(null);
  const [scoreHint, setScoreHint] = useState<string | null>(null);
  const index = i % lines.length;
  const target = lines[index]!;
  const targetDone = doneNow.has(target.id) || isPractised(target.id);
  const markPractised = (id: string) => {
    setDoneNow((prev) => new Set(prev).add(id));
    onPractised(id);
  };
  const go = (step: number) => {
    setI((x) => (x + step + lines.length) % lines.length);
    setScore(null);
    setRecorded(null);
    setRecordHint(null);
    setScoreHint(null);
  };
  const help: HelpContext = { ios: isIOS(), standalone: isStandalonePwa() };

  const startRecording = async () => {
    setRecordHint(null);
    const started = await createRecorder();
    if (!started.ok) {
      setRecordHint(recorderHelp(started.reason, help));
      return;
    }
    setRecording({ recorder: started.recorder, lineId: target.id });
    setRecorded(null);
  };
  const stopRecording = async () => {
    if (!recording) return;
    try {
      const made = await recording.recorder.stop();
      setRecorded({
        lineId: recording.lineId,
        url: URL.createObjectURL(made.blob),
        recording: made,
      });
      markPractised(recording.lineId);
    } catch (error) {
      if (!(error instanceof EmptyRecordingError)) throw error;
      setRecordHint(recorderHelp('empty', help));
    } finally {
      setRecording(null);
    }
  };

  const show = (lineId: string, recordingUrl: string | null, outcome: AssessOutcome) => {
    if (outcome.ok) {
      setScore({ lineId, assessment: outcome.assessment, recordingUrl });
      markPractised(lineId);
    } else if (outcome.failure.source === 'browser') {
      setScoreHint(recognitionHelp(outcome.failure.reason, help));
    } else if (outcome.failure.source === 'server') {
      setScoreHint(outcome.failure.message);
    } else {
      setScoreHint(t('shadowing.notScorable'));
    }
  };
  const run = async (
    lineId: string,
    recordingUrl: string | null,
    assess: () => Promise<AssessOutcome>
  ) => {
    setScoring(true);
    setScore(null);
    setScoreHint(null);
    try {
      show(lineId, recordingUrl, await assess());
    } finally {
      setScoring(false);
    }
  };
  // Called directly from the tap: iOS only allows recognition inside the user gesture.
  const scoreLive = () => run(target.id, null, () => browser.assess(target.ar));
  // The recording the learner just made: no second speaking.
  const scoreRecording = (made: NonNullable<typeof recorded>) =>
    run(made.lineId, made.url, () => asr.assess(target.ar, made.recording));
  const recordedHere = recorded?.lineId === target.id ? recorded : null;

  return (
    <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <span className="muted" aria-live="polite">
        {t('shadowing.position', { current: index + 1, total: lines.length })}
        {targetDone && <span className="feedback-good">{t('shadowing.recorded')}</span>}
      </span>
      <ArabicText size="lg">{target.ar}</ArabicText>
      <span className="muted">{target.de}</span>

      <div className="row" style={{ justifyContent: 'center' }}>
        <button
          className="btn btn-primary"
          onClick={() => speakArabic(target.ar, { rate })}
          disabled={!isTtsSupported()}
        >
          {t('shadowing.model')}
        </button>
        <label className="row muted" style={{ gap: '0.4rem' }}>
          {t('shadowing.tempo')}
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.1}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="row" style={{ justifyContent: 'center' }}>
        {isRecordingSupported() ? (
          recording ? (
            <button className="btn btn-accent" onClick={() => void stopRecording()}>
              {t('shadowing.stop')}
            </button>
          ) : (
            <button className="btn" onClick={() => void startRecording()}>
              {t('shadowing.record')}
            </button>
          )
        ) : (
          <span className="muted">{recorderHelp('unsupported', help)}</span>
        )}
        {recordedHere && <audio controls src={recordedHere.url} />}
      </div>
      {server && recordedHere && (
        <button
          className="btn btn-primary"
          onClick={() => void scoreRecording(recordedHere)}
          disabled={scoring}
        >
          {scoring ? t('shadowing.scoring') : t('shadowing.scoreRecording')}
        </button>
      )}
      {recordedHere && (
        <ShareRecording
          // A new recording starts a new, unshared offer.
          key={recordedHere.url}
          api={sharing}
          targets={shareTargets}
          text={target.ar}
          recording={recordedHere.recording}
          // Only the rating of this very recording goes along.
          score={score?.recordingUrl === recordedHere.url ? score.assessment.score : null}
        />
      )}
      {recordHint && (
        <p className="feedback-warn" role="alert" style={{ margin: 0 }}>
          {recordHint}
        </p>
      )}

      <div className="row" style={{ justifyContent: 'center' }}>
        {isRecognitionSupported() ? (
          <button
            className="btn btn-primary"
            onClick={() => void scoreLive()}
            disabled={scoring}
          >
            {scoring ? t('shadowing.listening') : t('shadowing.scoreLive')}
          </button>
        ) : (
          // With the server, a recording can be rated instead.
          !server && <span className="muted">{recognitionHelp('unsupported', help)}</span>
        )}
      </div>
      {scoreHint && (
        <p className="feedback-warn" role="alert" style={{ margin: 0 }}>
          {scoreHint}
        </p>
      )}

      {score?.lineId === target.id && (
        <LetterFeedback text={target.ar} assessment={score.assessment} />
      )}

      <div className="row" style={{ justifyContent: 'center' }}>
        <button
          className="btn"
          onClick={() => go(-1)}
          disabled={lines.length < 2 || recording !== null}
        >
          {t('shadowing.previous')}
        </button>
        <button
          className="btn"
          onClick={() => go(1)}
          disabled={lines.length < 2 || recording !== null}
        >
          {t('shadowing.next')}
        </button>
      </div>
    </div>
  );
}
