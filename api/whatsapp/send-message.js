// Vercel Serverless Function handler for /api/whatsapp/send-message
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { provider, instanceId, token, customUrl, recipientPhone, messageText } = req.body || {};

  if (!recipientPhone || !messageText) {
    return res.status(400).json({ success: false, error: "Telefone do destinatário e mensagem são obrigatórios." });
  }

  const cleanPhone = String(recipientPhone).replace(/\D/g, "");
  const formattedPhone = (cleanPhone.length === 10 || cleanPhone.length === 11) ? `55${cleanPhone}` : cleanPhone;

  function sanitizeParam(val) {
    if (!val) return "";
    if (typeof val === "object") {
      return val.instanceId || val.instance || val.token || val.url || val.apiUrl || val.id || JSON.stringify(val);
    }
    let str = String(val).trim();
    if (str.startsWith("{") && str.endsWith("}")) {
      try {
        const parsed = JSON.parse(str);
        return parsed.instanceId || parsed.instance || parsed.token || parsed.url || parsed.apiUrl || parsed.id || str;
      } catch (_) {}
    }
    return str;
  }

  const cleanInstanceId = sanitizeParam(instanceId);
  const cleanToken = sanitizeParam(token);
  let rawCustomUrl = sanitizeParam(customUrl).replace(/\/$/, "");
  let cleanCustomUrl = (rawCustomUrl.startsWith("http://") || rawCustomUrl.startsWith("https://")) ? rawCustomUrl : "";

  let endpoint = "";
  let headers = { "Content-Type": "application/json" };
  let payload = {};

  try {
    switch (provider) {
      case "meta_cloud":
        endpoint = cleanCustomUrl || `https://graph.facebook.com/v20.0/${cleanInstanceId}/messages`;
        headers["Authorization"] = cleanToken.startsWith("Bearer ") ? cleanToken : `Bearer ${cleanToken}`;
        payload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: formattedPhone,
          type: "text",
          text: { preview_url: false, body: messageText }
        };
        break;

      case "wapi":
        if (cleanCustomUrl && !cleanCustomUrl.includes("w-api.app")) {
          if (cleanCustomUrl.includes("instanceId=")) {
            endpoint = cleanCustomUrl;
          } else {
            endpoint = `${cleanCustomUrl}/v1/message/send-text?instanceId=${cleanInstanceId}`;
          }
        } else if (cleanInstanceId) {
          endpoint = `https://api.w-api.app/v1/message/send-text?instanceId=${cleanInstanceId}`;
        } else {
          endpoint = `https://api.w-api.app/v1/message/send-text`;
        }

        if (cleanToken) {
          headers["Authorization"] = cleanToken.startsWith("Bearer ") ? cleanToken : `Bearer ${cleanToken}`;
        }
        if (cleanInstanceId) {
          headers["instanceId"] = cleanInstanceId;
        }
        payload = {
          phone: formattedPhone,
          message: messageText,
          instanceId: cleanInstanceId
        };
        break;

      case "zapi":
        endpoint = cleanCustomUrl || `https://api.z-api.io/instances/${cleanInstanceId}/token/${cleanToken}/send-text`;
        headers["Client-Token"] = cleanToken;
        payload = { phone: formattedPhone, message: messageText };
        break;

      case "evolution":
        endpoint = cleanCustomUrl ? `${cleanCustomUrl}/message/sendText/${cleanInstanceId}` : `https://api.evolution-api.com/message/sendText/${cleanInstanceId}`;
        headers["apikey"] = cleanToken;
        payload = { number: formattedPhone, text: messageText };
        break;

      case "ultramsg":
        endpoint = cleanCustomUrl || `https://api.ultramsg.com/${cleanInstanceId}/messages/chat`;
        payload = { token: cleanToken, to: formattedPhone, body: messageText };
        break;

      default:
        endpoint = cleanCustomUrl;
        if (!endpoint) {
          return res.status(400).json({ success: false, error: "URL do endpoint não configurada." });
        }
        if (cleanToken) {
          headers["Authorization"] = cleanToken.startsWith("Bearer ") ? cleanToken : `Bearer ${cleanToken}`;
        }
        payload = { phone: formattedPhone, message: messageText, instanceId: cleanInstanceId };
        break;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const responseText = await response.text().catch(() => "");
    let responseJson = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch (_) {}

    if (response.ok || response.status === 200 || response.status === 201) {
      return res.status(200).json({
        success: true,
        data: responseJson || responseText
      });
    } else {
      const errMsg = responseJson?.message || responseJson?.error?.message || responseJson?.error || responseJson?.description || `HTTP ${response.status}`;
      return res.status(200).json({
        success: false,
        error: `Erro ${provider ? provider.toUpperCase() : 'API'} (HTTP ${response.status}): ${errMsg}`
      });
    }
  } catch (error) {
    return res.status(200).json({
      success: false,
      error: `Falha ao contatar gateway: ${error?.message || 'Erro de conexão'}`
    });
  }
}
