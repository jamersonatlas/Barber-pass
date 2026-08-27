import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Google GenAI client on server
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// API: AI Support Chat for customers
app.post("/api/ai/support-chat", async (req, res) => {
  const { message, history = [], context = {} } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: "Mensagem obrigatória." });
  }

  const {
    barbeariaName = "Barbearia",
    services = [],
    plans = [],
    address = "",
    phone = "",
    operatingHours = ""
  } = context;

  // Format services info for context
  const servicesText = services.length > 0
    ? services.map((s: any) => `- ${s.name}: R$ ${Number(s.price || 0).toFixed(2).replace('.', ',')} (${s.description || 'Atendimento com horário marcado'})`).join('\n')
    : "- Corte Masculino / Degrade: R$ 35,00\n- Barba Completa / Modelada: R$ 25,00\n- Combo Corte + Barba: R$ 55,00\n- Sobrancelha na Navalha: R$ 15,00";

  // Format plans info for context
  const plansText = plans.length > 0
    ? plans.map((p: any) => `- Plano ${p.name}: R$ ${Number(p.price || 0).toFixed(2).replace('.', ',')}/mês (${p.description || 'Cortes regulares com horários fixos sem fila'})`).join('\n')
    : "- Plano Mensal Individual: Cortes e manutenção no mês com horário garantido e prioridade.\n- Plano VIP Barba e Cabelo: Cortes e barboterapia durante o mês todo com economia de até 40%.";

  const systemInstruction = `Você é o Assistente Virtual e Suporte Inteligente da barbearia "${barbeariaName}".
Seu papel é tirar dúvidas dos clientes com simpatia, rapidez, clareza e objetividade (em Português do Brasil).

INFORMAÇÕES DA BARBEARIA:
- Nome da Barbearia: ${barbeariaName}
- Endereço / Localização: ${address || "Consulte o perfil da barbearia para o endereço exato."}
- Telefone / WhatsApp: ${phone || "Disponível na tela principal"}
- Horários de Funcionamento: ${operatingHours || "Terça a Sábado das 09:00 às 20:00 (consulte os horários em tempo real na agenda)"}

TABELA DE SERVIÇOS & PREÇOS ATUAIS:
${servicesText}

PLANOS DE ASSINATURA MENSAL:
${plansText}

COMO RESPONDER A DÚVIDAS COMUNS:
1. Como agendar um horário:
   - Explique que o cliente pode escolher o barbeiro de sua preferência, selecionar o serviço desejado, escolher o dia e horário livre na grade, preencher nome e telefone e confirmar.
   - O agendamento pode ser pago na barbearia no momento do atendimento ou antecipado via Pix com confirmação instantânea.

2. Valores de serviços:
   - Apresente os preços dos serviços cadastrados acima de forma clara e organizada.

3. Como funciona e como adquirir uma assinatura / plano:
   - Explique as vantagens: horários fixos reservados toda semana só para ele (sem risco de ficar sem vaga), economia mensal, atendimento prioritário e cortes regulares.
   - Para assinar, o cliente pode solicitar diretamente ao barbeiro ou pelo WhatsApp para ativar o plano na conta dele.

4. Cancelamentos e Reagendamentos:
   - Explique que pode consultar seus agendamentos no link do cliente ou avisar com antecedência pelo WhatsApp da barbearia.

5. Formas de pagamento:
   - Aceita Pix instantâneo, Cartão de Crédito/Débito e Dinheiro no estabelecimento.

DIRETRIZES DE RESPOSTA:
- Seja educado, acolhedor, use emojis moderados (💈, ✂️, 📅, 💎, ✨) para deixar a leitura agradável.
- Use parágrafos curtos ou listas com marcadores para respostas fáceis de ler no celular.
- Mantenha o foco em ajudar o cliente a agendar, conhecer os serviços e tirar dúvidas.`;

  try {
    // Build conversation contents
    const contents: any[] = [];

    // Add prior history if provided
    if (Array.isArray(history) && history.length > 0) {
      for (const h of history.slice(-6)) {
        if (h.role && h.text) {
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
          });
        }
      }
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });

    const responseText = response.text || `Olá! Sou o suporte virtual da ${barbeariaName}. Como posso ajudar com seu agendamento ou dúvidas? 💈`;

    return res.json({
      success: true,
      reply: responseText
    });
  } catch (error: any) {
    console.error("[AI Support Chat Error, using smart fallback]:", error?.message || error);

    // Smart fallback if API is unreachable or rate limited
    let fallbackReply = `Olá! Sou o assistente da ${barbeariaName}. Posso te ajudar com agendamentos, valores de serviços, planos mensais ou dúvidas gerais. O que você gostaria de saber? 💈`;
    const lower = message.toLowerCase().trim();

    if (lower === 'oi' || lower === 'olá' || lower === 'ola' || lower === 'opa' || lower === 'boa tarde' || lower === 'bom dia' || lower === 'boa noite') {
      fallbackReply = `Olá! Seja muito bem-vindo à **${barbeariaName}**! 💈\n\nComo posso te ajudar hoje? Você pode tirar dúvidas sobre:\n• 📅 **Agendamento de horários**\n• ✂️ **Tabela de serviços e valores**\n• 💎 **Planos de assinatura mensal**\n• 💳 **Formas de pagamento**`;
    } else if (lower.includes("agendar") || lower.includes("marcar") || lower.includes("horario") || lower.includes("horário") || lower.includes("vaga")) {
      fallbackReply = `📅 **Como Agendar seu Horário:**\n\n1. Escolha o profissional de sua preferência.\n2. Selecione o serviço (Corte, Barba, etc.).\n3. Escolha o dia e o horário disponível na grade.\n4. Preencha seu nome e telefone para confirmar a reserva!\n\nVocê pode pagar no local no momento do atendimento ou antecipado via Pix com confirmação imediata. 💈`;
    } else if (lower.includes("valor") || lower.includes("preço") || lower.includes("preco") || lower.includes("quanto") || lower.includes("serviço") || lower.includes("servico") || lower.includes("tabela") || lower.includes("corte") || lower.includes("barba")) {
      fallbackReply = `✂️ **Tabela de Serviços & Valores:**\n\n${servicesText}\n\nSelecione o serviço na tela para ver os horários disponíveis em tempo real!`;
    } else if (lower.includes("assinatura") || lower.includes("plano") || lower.includes("mensal") || lower.includes("mensalidade") || lower.includes("assinante") || lower.includes("vantagem")) {
      fallbackReply = `💎 **Como Funciona a Assinatura / Plano Mensal:**\n\n• **Horário Fixo Garantido:** Seu horário reservado toda semana sem risco de perder a vaga.\n• **Economia:** Cortes regulares com desconto de até 40% em relação ao avulso.\n• **Atendimento VIP:** Prioridade no atendimento e manutenção constante do visual.\n\nPara assinar, solicite diretamente ao barbeiro ou entre em contato pelo WhatsApp da barbearia! 💈`;
    } else if (lower.includes("pagamento") || lower.includes("pix") || lower.includes("cartao") || lower.includes("cartão") || lower.includes("dinheiro")) {
      fallbackReply = `💳 **Formas de Pagamento Aceitas:**\n\n• **Pix:** Pagamento instantâneo direto no agendamento ou balcão.\n• **Cartão de Crédito e Débito:** Aceito na maquininha no estabelecimento.\n• **Dinheiro:** Diretamente na barbearia.`;
    } else if (lower.includes("endereço") || lower.includes("endereco") || lower.includes("onde") || lower.includes("local") || lower.includes("funcionamento") || lower.includes("contato") || lower.includes("whatsapp")) {
      fallbackReply = `📍 **Localização & Informações:**\n\n• **Barbearia:** ${barbeariaName}\n• **Endereço:** ${address || "Consulte o endereço informado na página principal."}\n• **Horário:** ${operatingHours || "Terça a Sábado das 09:00 às 20:00."}\n• **WhatsApp:** ${phone || "Disponível na tela de agendamento"}`;
    }

    return res.json({
      success: true,
      reply: fallbackReply,
      fallback: true
    });
  }
});

// API: Check if Mercado Pago is configured globally
app.get("/api/mercado-pago/config", (req, res) => {
  const isConfigured = !!process.env.MERCADO_PAGO_ACCESS_TOKEN;
  res.json({
    configured: isConfigured,
    message: isConfigured 
      ? "Mercado Pago está configurado no servidor e pronto para receber pagamentos." 
      : "Mercado Pago pronto para conexão. Você pode inserir seu Access Token no painel da barbearia."
  });
});

// API: Test Mercado Pago Access Token
app.post("/api/mercado-pago/test-token", async (req, res) => {
  const { accessToken } = req.body;
  const token = (accessToken || "").trim() || process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!token) {
    return res.status(400).json({ success: false, error: "Access Token não informado." });
  }

  try {
    const response = await fetch("https://api.mercadopago.com/users/me", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        success: false,
        error: errData.message || "Token inválido ou expirado no Mercado Pago."
      });
    }

    const userData = await response.json();
    return res.json({
      success: true,
      message: "Credencial validada com sucesso no Mercado Pago!",
      account: {
        id: userData.id,
        nickname: userData.nickname,
        firstName: userData.first_name,
        lastName: userData.last_name,
        email: userData.email,
        siteId: userData.site_id
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: `Erro ao conectar com o Mercado Pago: ${error.message || "Falha de rede"}`
    });
  }
});

// Helper to extract clean string value (handles user pasting JSON or surrounding quotes)
function sanitizeWhatsAppParam(val: any): string {
  if (!val) return "";
  if (typeof val === "object") {
    // If user passed or pasted an object
    return val.instanceId || val.instance || val.token || val.url || val.apiUrl || val.id || JSON.stringify(val);
  }
  let str = String(val).trim();
  // Check if user pasted a JSON string like '{"instanceId":"LITE-...",...}'
  if (str.startsWith("{") && str.endsWith("}")) {
    try {
      const parsed = JSON.parse(str);
      return parsed.instanceId || parsed.instance || parsed.token || parsed.url || parsed.apiUrl || parsed.id || str;
    } catch (_) {}
  }
  return str;
}

// API: Proxy WhatsApp message dispatch to bypass CORS and handle gateway providers
const handleWhatsAppSend = async (req: express.Request, res: express.Response) => {
  const { provider, instanceId, token, customUrl, recipientPhone, messageText } = req.body;

  if (!recipientPhone || !messageText) {
    return res.json({ success: false, error: "Telefone do destinatário e mensagem são obrigatórios." });
  }

  const cleanPhone = (recipientPhone || "").replace(/\D/g, "");
  const formattedPhone = (cleanPhone.length === 10 || cleanPhone.length === 11) ? `55${cleanPhone}` : cleanPhone;

  let endpoint = "";
  let headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  let payload: any = {};

  const cleanInstanceId = sanitizeWhatsAppParam(instanceId);
  const cleanToken = sanitizeWhatsAppParam(token);
  let rawCustomUrl = sanitizeWhatsAppParam(customUrl).replace(/\/$/, "");

  // If customUrl is a JSON or not a valid URL starting with http, discard it to prevent TypeError: Invalid URL
  let cleanCustomUrl = "";
  if (rawCustomUrl.startsWith("http://") || rawCustomUrl.startsWith("https://")) {
    cleanCustomUrl = rawCustomUrl;
  }

  try {
    switch (provider) {
      case "meta_cloud":
        if (!cleanInstanceId && !cleanCustomUrl) {
          return res.json({
            success: false,
            error: "Para usar a Meta WhatsApp Cloud API, informe o 'ID do Número de Telefone (Phone Number ID)' no formulário."
          });
        }
        endpoint = cleanCustomUrl || `https://graph.facebook.com/v20.0/${cleanInstanceId}/messages`;
        headers["Authorization"] = cleanToken.startsWith("Bearer ") ? cleanToken : `Bearer ${cleanToken}`;
        payload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: formattedPhone,
          type: "text",
          text: {
            preview_url: false,
            body: messageText
          }
        };
        break;

      case "zapi":
        if (cleanCustomUrl) {
          if (cleanCustomUrl.includes("/send-text") || cleanCustomUrl.includes("/send-message")) {
            endpoint = cleanCustomUrl;
          } else if (cleanCustomUrl.includes("/instances/")) {
            endpoint = cleanCustomUrl.endsWith("/send-text") ? cleanCustomUrl : `${cleanCustomUrl}/send-text`;
          } else {
            endpoint = `${cleanCustomUrl}/instances/${cleanInstanceId}/token/${cleanToken}/send-text`;
          }
        } else {
          endpoint = `https://api.z-api.io/instances/${cleanInstanceId}/token/${cleanToken}/send-text`;
        }
        if (cleanToken) {
          headers["Client-Token"] = cleanToken;
          headers["apikey"] = cleanToken;
        }
        payload = {
          phone: formattedPhone,
          message: messageText
        };
        break;

      case "evolution":
        if (cleanCustomUrl) {
          if (cleanCustomUrl.includes("/message/sendText/")) {
            endpoint = cleanCustomUrl;
          } else if (cleanCustomUrl.includes("/message/sendText")) {
            endpoint = `${cleanCustomUrl}/${cleanInstanceId}`;
          } else {
            endpoint = `${cleanCustomUrl}/message/sendText/${cleanInstanceId}`;
          }
        } else if (cleanInstanceId) {
          endpoint = `https://api.evolution-api.com/message/sendText/${cleanInstanceId}`;
        } else {
          return res.json({ 
            success: false, 
            error: "Para usar a Evolution API, preencha o Nome da Instância e a URL do Servidor em 'URL Customizada do Servidor' (ex: https://sua-evolution.com)." 
          });
        }
        if (cleanToken) {
          headers["apikey"] = cleanToken;
          headers["Authorization"] = cleanToken.startsWith("Bearer ") ? cleanToken : `Bearer ${cleanToken}`;
        }
        payload = {
          number: formattedPhone,
          text: messageText,
          options: {
            delay: 1000,
            presence: "composing"
          }
        };
        break;

      case "ultramsg":
        endpoint = cleanCustomUrl || `https://api.ultramsg.com/${cleanInstanceId}/messages/chat`;
        payload = {
          token: cleanToken,
          to: formattedPhone,
          body: messageText
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
          headers["Client-Token"] = cleanToken;
          headers["apikey"] = cleanToken;
          headers["x-api-key"] = cleanToken;
          headers["token"] = cleanToken;
        }
        if (cleanInstanceId) {
          headers["instanceId"] = cleanInstanceId;
          headers["instance_id"] = cleanInstanceId;
          headers["instance"] = cleanInstanceId;
        }
        payload = {
          phone: formattedPhone,
          message: messageText,
          instanceId: cleanInstanceId,
          instance_id: cleanInstanceId,
          chatId: formattedPhone.includes("@") ? formattedPhone : `${formattedPhone}@c.us`,
          number: formattedPhone,
          to: formattedPhone,
          text: messageText,
          body: messageText
        };
        break;

      case "custom":
      default:
        endpoint = cleanCustomUrl;
        if (!endpoint) {
          return res.json({ 
            success: false, 
            error: "URL do Webhook / API Customizada não informada. Preencha o campo 'URL Customizada do Servidor' nas configurações." 
          });
        }
        if (cleanToken) {
          headers["Authorization"] = cleanToken.startsWith("Bearer ") ? cleanToken : `Bearer ${cleanToken}`;
          headers["x-api-key"] = cleanToken;
        }
        payload = {
          instanceId: cleanInstanceId,
          phone: formattedPhone,
          number: formattedPhone,
          message: messageText,
          text: messageText
        };
        break;
    }

    if (!endpoint) {
      return res.json({ success: false, error: "URL do endpoint do WhatsApp não configurada." });
    }

    console.log(`[WhatsApp Server Proxy] Disparando via ${provider} -> ${endpoint}`);

    let response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    let responseText = await response.text().catch(() => "");

    // W-API / WaAPI fallback endpoints se der 404 e nao houver customUrl
    if (provider === "wapi" && response.status === 404 && !cleanCustomUrl) {
      const fallbackUrls = [
        `https://api.w-api.app/v1/message/send-text`,
        `https://api.w-api.app/v1/message/send-text?instanceId=${cleanInstanceId}`,
        `https://api.w-api.app/v1/instances/${cleanInstanceId}/send-text`,
        `https://api.w-api.app/v1/instances/${cleanInstanceId}/message/send-text`,
        `https://api.w-api.app/v1/message/sendText`,
        `https://api.w-api.app/v1/instances/${cleanInstanceId}/send-message`,
        `https://waapi.app/api/v1/instances/${cleanInstanceId}/client/action/send-message`,
        `https://api.w-api.app/v1/instances/${cleanInstanceId}/client/action/send-message`,
        `https://w-api.app/v1/instances/${cleanInstanceId}/send-message`,
        `https://api.w-api.app/v1/send-text`
      ];

      for (const fallbackUrl of fallbackUrls) {
        if (fallbackUrl === endpoint) continue;
        console.log(`[WhatsApp Proxy Fallback] Testando URL alternativa W-API: ${fallbackUrl}`);
        const fbRes = await fetch(fallbackUrl, { method: "POST", headers, body: JSON.stringify(payload) });
        const fbTxt = await fbRes.text().catch(() => "");
        if (fbRes.ok || fbRes.status === 200 || fbRes.status === 201) {
          response = fbRes;
          responseText = fbTxt;
          endpoint = fallbackUrl;
          break;
        }
      }
    }

    let responseJson: any = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch (_) {}

    if (response.ok || response.status === 200 || response.status === 201) {
      return res.json({
        success: true,
        data: responseJson || responseText
      });
    } else {
      console.error(`[WhatsApp Server Proxy Error ${response.status} na URL ${endpoint}]:`, responseText);
      
      let rawDetail = responseJson?.message || responseJson?.error?.message || responseJson?.error || responseJson?.description || responseJson?.details || (typeof responseText === 'string' ? responseText.substring(0, 180) : '') || `HTTP ${response.status}`;
      
      let hint = "";
      if (response.status === 404) {
        hint = ` A rota ou ID da instância não existe no provedor ${provider.toUpperCase()}. Verifique se o ID da Instância (${cleanInstanceId || 'vazio'}) está correto ou cole o link do endpoint no campo 'URL Customizada'.`;
      } else if (response.status === 401) {
        hint = " Token de API recusado ou expirado. Verifique se copiou a chave correta no seu painel.";
      } else if (response.status === 400) {
        hint = " Requisição inválida. Verifique se a sua sessão do WhatsApp está Conectada e se o telefone possui DDD.";
      } else if (response.status === 403) {
        hint = " Permissão negada ou plano sem créditos na plataforma do WhatsApp.";
      }

      return res.json({
        success: false,
        error: `Erro ${provider.toUpperCase()} (HTTP ${response.status}): ${rawDetail}.${hint ? ' ' + hint : ''}`
      });
    }
  } catch (error: any) {
    console.error("[WhatsApp Server Proxy Exception]:", error);
    return res.json({
      success: false,
      error: `Falha ao conectar com o provedor de WhatsApp: ${error.message || "Erro de conexão"}`
    });
  }
};

app.post("/api/whatsapp/send-message", handleWhatsAppSend);
app.post("/api/proxy/whatsapp", handleWhatsAppSend);

// API: Create a Pix Payment
app.post("/api/mercado-pago/create-pix", async (req, res) => {
  const { amount, description, clientName, clientEmail, clientPhone, customAccessToken } = req.body;
  
  const accessToken = (customAccessToken || "").trim() || process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(400).json({
      error: "O Mercado Pago não está configurado nesta barbearia. Defina seu Access Token nas configurações da barbearia."
    });
  }

  try {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      return res.status(400).json({ error: "Valor do pagamento inválido." });
    }

    // Clean phone and extract names
    const names = (clientName || "Cliente").trim().split(" ");
    const firstName = names[0] || "Cliente";
    const lastName = names.slice(1).join(" ") || "Barbearia";
    const cleanPhoneDigits = (clientPhone || "").replace(/\D/g, "");
    const email = clientEmail || `${firstName.toLowerCase().replace(/[^a-z0-9]/g, "")}_${cleanPhoneDigits.slice(-4) || 'pix'}@gmail.com`;

    // 15 minutes expiration
    const expirationDate = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const idempotencyKey = `pix-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    const mpBody: any = {
      transaction_amount: Number(value.toFixed(2)),
      description: description || "Agendamento de Horário - Barbearia",
      payment_method_id: "pix",
      date_of_expiration: expirationDate,
      payer: {
        email: email,
        first_name: firstName,
        last_name: lastName
      }
    };

    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify(mpBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Mercado Pago API error response:", errorData);
      return res.status(response.status).json({
        error: errorData.message || errorData.cause?.[0]?.description || "Erro retornado pelo Mercado Pago ao gerar cobrança Pix.",
        details: errorData
      });
    }

    const data = await response.json();

    return res.json({
      success: true,
      paymentId: data.id,
      status: data.status,
      statusDetail: data.status_detail,
      qrCode: data.point_of_interaction?.transaction_data?.qr_code,
      qrCodeBase64: data.point_of_interaction?.transaction_data?.qr_code_base64,
      ticketUrl: data.point_of_interaction?.transaction_data?.ticket_url,
      expiresAt: expirationDate
    });
  } catch (error: any) {
    console.error("Error creating Pix payment:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar Pix." });
  }
});

// API: Create a Preference Link (for Card/General checkout)
app.post("/api/mercado-pago/create-preference", async (req, res) => {
  const { amount, description, clientName, clientEmail, customAccessToken } = req.body;

  const accessToken = (customAccessToken || "").trim() || process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(400).json({
      error: "O Mercado Pago não está configurado nesta barbearia. Defina seu Access Token nas configurações."
    });
  }

  try {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      return res.status(400).json({ error: "Valor inválido." });
    }

    const names = (clientName || "Cliente").trim().split(" ");
    const firstName = names[0] || "Cliente";
    const email = clientEmail || `${firstName.toLowerCase().replace(/[^a-z0-9]/g, "")}@gmail.com`;

    const appUrl = process.env.APP_URL || `http://localhost:3000`;

    const mpBody = {
      items: [
        {
          title: description || "Reserva de Horário - Barbearia",
          quantity: 1,
          currency_id: "BRL",
          unit_price: value
        }
      ],
      payer: {
        name: clientName || "Cliente",
        email: email
      },
      back_urls: {
        success: `${appUrl}?payment_status=success`,
        failure: `${appUrl}?payment_status=failure`,
        pending: `${appUrl}?payment_status=pending`
      },
      auto_return: "approved"
    };

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(mpBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Mercado Pago Preference API error:", errorData);
      return res.status(response.status).json({
        error: errorData.message || "Erro retornado ao gerar link de pagamento.",
        details: errorData
      });
    }

    const data = await response.json();

    return res.json({
      success: true,
      preferenceId: data.id,
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point
    });
  } catch (error: any) {
    console.error("Error creating payment preference:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao processar link de pagamento." });
  }
});

// API: Check Payment Status
app.get("/api/mercado-pago/payment-status/:paymentId", async (req, res) => {
  const { paymentId } = req.params;
  const customToken = req.headers["x-access-token"] as string || req.query.token as string;
  const accessToken = (customToken || "").trim() || process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken) {
    return res.status(400).json({ error: "Mercado Pago não está configurado." });
  }

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Erro ao consultar status no Mercado Pago." });
    }

    const data = await response.json();
    return res.json({
      id: data.id,
      status: data.status, // e.g., 'pending', 'approved', 'rejected', 'cancelled'
      statusDetail: data.status_detail,
      amount: data.transaction_amount,
      approvedAt: data.date_approved
    });
  } catch (error: any) {
    console.error("Error checking payment status:", error);
    return res.status(500).json({ error: error.message || "Erro ao consultar status." });
  }
});

// Vite middleware & Static Assets serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
