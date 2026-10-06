import {APIError} from './store.mjs';

export const googleVoiceModel = 'gemini-3.8-live';
export function createGoogleVoiceBroker({apiKey,model = googleVoiceModel,fetchImpl = fetch,clock = Date.now} = {}) {
  if (!/^gemini-[a-zA-Z0-9._-]{1,72}$/.test(model)) throw new Error('BAC_IO_GOOGLE_MODEL ist ungültig.');
  const configured = typeof apiKey === 'string' && apiKey.trim().length > 0;
  let starts = [], inFlight = false;
  async function createSession(body) {
    if (!configured) throw new APIError(503,'Gemini-API-Schlüssel ist am Server noch nicht eingerichtet.');
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length) throw new APIError(400,'Die Sitzung benötigt keine Controller- oder Zugangsdaten.');
    const now = clock(); starts = starts.filter(t=>now-t < 3600_000);
    if (inFlight || starts.length >= 12) throw new APIError(429,'Sitzungslimit erreicht. Später erneut starten.');
    starts.push(now); inFlight = true;
    const startDeadline = now + 60_000;
    try {
      const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(10_000),
        headers:{'x-goog-api-key':apiKey.trim(),'Content-Type':'application/json'},
        body:JSON.stringify({uses:1,newSessionExpireTime:new Date(startDeadline).toISOString(),expireTime:new Date(now+600_000).toISOString(),
          // AuthToken raw REST schema. Lock the model, allow the app's own
          // instructions/tools/context in the WebSocket setup message.
          fieldMask:'model',bidiGenerateContentSetup:{model:'models/'+model}})
      });
      if (response.status === 429) throw new APIError(429,'Google-Kontingent oder Sitzungslimit erreicht. Später erneut starten.');
      if (!response.ok) throw new APIError(502,'Google-Zugang nicht verfügbar. API-Schlüssel, Kontingent und Modellfreigabe am Server prüfen.');
      const raw = await response.text();
      if (raw.length > 20_000) throw new APIError(502,'Google hat keine gültige Sitzungsfreigabe geliefert.');
      const payload = JSON.parse(raw);
      if (typeof payload.name !== 'string' || !/^auth_tokens\/[^\s]{1,10000}$/.test(payload.name) || clock() >= startDeadline) throw new APIError(502,'Google hat keine gültige Sitzungsfreigabe geliefert.');
      return {secret:payload.name,model,expiresAt:startDeadline/1000,maxSeconds:600,provider:'google',apiVersion:'v1beta'};
    } catch(error) {
      if (error instanceof APIError) throw error;
      throw new APIError(502,'Google ist nicht erreichbar oder die Sitzungsfreigabe ist ungültig.');
    } finally { inFlight = false; }
  }
  createSession.status = () => ({service:'bacsolution-google-voice',schema:1,configured,model,maxSeconds:600});
  return createSession;
}
