"use client";
import { useEffect, useRef, useState } from "react";
import { parseClaimFacts, type ClaimFacts } from "../../lib/claimFacts";
import type { IntakeExtractionMode, IntakeResult } from "../../lib/intake";
import type { SafetyAssessment } from "../../lib/safety";
import type { AnalysisResult, Script } from "../../lib/types";
type ConversationMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

const initialMessages: ConversationMessage[] = [
  {
    id: "intake-welcome",
    role: "assistant",
    content:
      "Tell me what happened in your own words. I’ll ask only for details that change the policy, case search, or next action."
  }
];


export function useClaimConversation() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages);
  const [facts, setFacts] = useState<ClaimFacts | null>(null);
  const [extractionMode, setExtractionMode] = useState<IntakeExtractionMode | null>(null);
  const [safetyNotice, setSafetyNotice] = useState<SafetyAssessment | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);

  const requestVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const [remember, setRemember] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const draftKey = "travel-claim-draft-v1";

  useEffect(() => {
    const versionRef = requestVersion;
    const requestRef = activeRequest;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw && raw.length <= 200_000) {
        const saved = JSON.parse(raw);
        const parsed = saved.facts ? parseClaimFacts(saved.facts) : null;
        if (saved.version === 1 && (!saved.facts || parsed?.success)) {
          setFacts(parsed?.success ? parsed.data : null);
          setDraft(typeof saved.draft === "string" ? saved.draft.slice(0, 4000) : "");
          if (Array.isArray(saved.messages) && saved.messages.length <= 20 && saved.messages.every((item: ConversationMessage) =>
            item && typeof item.id === "string" && typeof item.content === "string" && item.content.length <= 4000 && ["user", "assistant"].includes(item.role))) setMessages(saved.messages);
          setRemember(true);
        }
      }
    } catch { /* Unavailable or old browser storage does not prevent a new claim. */ }
    setStorageReady(true);
    return () => { versionRef.current++; requestRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      if (remember) localStorage.setItem(draftKey, JSON.stringify({ version: 1, facts, draft, messages: messages.slice(-20) }));
      else localStorage.removeItem(draftKey);
    } catch { setError("Browser storage is unavailable. Keep this page open or export your result."); }
  }, [storageReady, remember, facts, draft, messages]);

  useEffect(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [messages]);

  async function reanalyzeFacts() {
    if (!facts || isLoading) return;
    const version = ++requestVersion.current;
    const controller = new AbortController(); activeRequest.current = controller;
    const timer = setTimeout(() => controller.abort(), 30000);
    setIsLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts }), signal: controller.signal });
      const payload = await response.json();
      if (version !== requestVersion.current) return;
      if (!response.ok) { setSafetyNotice(payload.safety ?? null); throw new Error(payload.error ?? "Analysis failed."); }
      setResult(payload);
    } catch (error) {
      if (version === requestVersion.current) setError(error instanceof Error && error.name !== "AbortError" ? error.message : "Request timed out. You can retry.");
    } finally { clearTimeout(timer); if (version === requestVersion.current) setIsLoading(false); }
  }

  async function submitIntake(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isLoading) {
      return;
    }

    const version = ++requestVersion.current;
    const controller = new AbortController(); activeRequest.current = controller;
    const timer = setTimeout(() => controller.abort(), 30000);
    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setIsLoading(true);
    setError("");
    setSafetyNotice(null);
    setCopiedScriptId(null);
    setResult(null);

    try {
      const intakeResponse = await fetch("/api/intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message, facts }),
        signal: controller.signal
      });
      const intake = (await intakeResponse.json()) as IntakeResult & { error?: string };

      if (version !== requestVersion.current) return;
      if (!intakeResponse.ok) {
        throw new Error(intake.error ?? "Intake failed.");
      }

      setFacts(intake.facts);
      setExtractionMode(intake.extractionMode);
      setSafetyNotice(intake.safety ?? null);

      if (intake.status === "unsupported") {
        setMessages([
          ...nextMessages,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content:
              intake.safety?.message ??
              "This request is outside the supported scope of the demo."
          }
        ]);
        return;
      }

      if (intake.status === "needs_info") {
        setMessages([
          ...nextMessages,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: intake.question ?? "Please add a little more detail."
          }
        ]);
        return;
      }

      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ facts: intake.facts }),
        signal: controller.signal
      });
      const analysis = (await analyzeResponse.json()) as AnalysisResult & { error?: string };

      if (version !== requestVersion.current) return;
      if (!analyzeResponse.ok) {
        setSafetyNotice((analysis as typeof analysis & { safety?: SafetyAssessment }).safety ?? null);
        throw new Error(analysis.error ?? "Analysis failed.");
      }

      setResult(analysis);
      setMessages([
        ...nextMessages,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content:
            intake.facts.disruptionReasonStatus === "unavailable"
              ? "I’ll continue with the airline’s reason marked as unavailable. Cause-dependent remedies remain conditional; review the grounded references below."
              : "I have enough detail for the first-pass analysis. Review the extracted facts and the grounded references below."
        }
      ]);
    } catch (caughtError) {
      if (version !== requestVersion.current) return;
      setMessages(messages); setDraft(message); setFacts(facts); setResult(result);
      setError(caughtError instanceof Error && caughtError.name !== "AbortError" ? caughtError.message : "Request timed out. Your answer is restored; you can retry.");
    } finally {
      clearTimeout(timer);
      if (version === requestVersion.current) setIsLoading(false);
    }
  }

  function resetClaim() {
    requestVersion.current++; activeRequest.current?.abort(); setIsLoading(false);
    setDraft("");
    setMessages(initialMessages);
    setFacts(null);
    setExtractionMode(null);
    setSafetyNotice(null);
    setResult(null);
    setError("");
    setCopiedScriptId(null);
  }

  async function copyScript(script: Script) {
    try { await navigator.clipboard.writeText(script.template); setCopiedScriptId(script.script_id); }
    catch { setError("Copy failed. Select and copy the script text manually."); }
  }


  return {requestVersion,draft,setDraft,messages,facts,setFacts,extractionMode,safetyNotice,result,setResult,error,isLoading,copiedScriptId,transcript,remember,setRemember,reanalyzeFacts,submitIntake,resetClaim,copyScript};
}
