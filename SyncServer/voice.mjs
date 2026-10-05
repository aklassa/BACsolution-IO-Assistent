import { APIError } from './store.mjs';
import { guidedInstructions, guidedTools } from '../Shared/guided.js';

export function createVoiceBroker({apiKey, model = 'gpt-realtime', fetchImpl = fetch, clock = Date.now} = {}) {
  let starts = [], inFlight = false;
  return async function createSession(body) {
    if (!apiKey) throw new APIError(503, 'KI-Zugang ist am Server noch nicht eingerichtet.');
    if (!body || Object.keys(body).length) throw new APIError(400, 'Die Sitzung benötigt keine Controller- oder Zugangsdaten.');
    const now = clock(); starts = starts.filter(t => now - t < 3600_000);
    if (inFlight || starts.length >= 12) throw new APIError(429, 'Sitzungslimit erreicht. Später erneut starten.');
    starts.push(now); inFlight = true;
    try {
      const response = await fetchImpl('https://api.openai.com/v1/realtime/client_secrets', {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(10_000),
        headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
        body:JSON.stringify({expires_after:{anchor:'created_at',seconds:60},session:{
          type:'realtime', model, instructions:guidedInstructions, output_modalities:['audio'],
          max_output_tokens:800, tools:guidedTools, tool_choice:'auto',
          audio:{input:{format:{type:'audio/pcm',rate:24000},
            transcription:{model:'gpt-4o-mini-transcribe',language:'de'},
            turn_detection:{type:'semantic_vad',eagerness:'medium',create_response:false,interrupt_response:false}},
            output:{format:{type:'audio/pcm',rate:24000},voice:'marin'}}
        }})
      });
      if (!response.ok) throw new APIError(502, `KI-Dienst nicht bereit (HTTP ${response.status}). API-Projekt, Guthaben und Modellfreigabe am Server prüfen.`);
      const payload = await response.json();
      if (typeof payload.value !== 'string' || !payload.value.startsWith('ek_') || !Number.isFinite(payload.expires_at) || payload.expires_at * 1000 <= clock()) {
        throw new APIError(502, 'KI-Dienst hat keine gültige Sitzungsfreigabe geliefert.');
      }
      return {secret:payload.value, expiresAt:payload.expires_at, model, maxSeconds:600};
    } catch (e) {
      if (e instanceof APIError) throw e;
      throw new APIError(502, 'KI-Dienst ist nicht erreichbar. Es wurde keine Sitzung gestartet.');
    } finally { inFlight = false; }
  };
}
