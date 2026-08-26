import { WhatsAppConfig, WhatsAppDispatchLog } from '../types';

/**
 * Format clean phone number without spaces or special characters.
 * Ensures Brazil DDI 55 if length is 10 or 11.
 */
export function formatWhatsAppPhone(phone: string): string {
  const clean = (phone || '').replace(/\D/g, '');
  if (!clean) return '';
  if (clean.length === 10 || clean.length === 11) {
    return `55${clean}`;
  }
  return clean;
}

/**
 * Generates direct wa.me / web.whatsapp URL for 1-click manual or backup dispatch.
 */
export function getWhatsAppDirectUrl(phone: string, messageText: string): string {
  const cleanPhone = formatWhatsAppPhone(phone);
  const encoded = encodeURIComponent(messageText);
  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`;
}

/**
 * Opens WhatsApp direct message in browser or app.
 */
export function openWhatsAppDirect(phone: string, messageText: string): void {
  const url = getWhatsAppDirectUrl(phone, messageText);
  try {
    const win = window.open(url, '_blank');
    if (!win) {
      window.location.href = url;
    }
  } catch (_) {
    window.location.href = url;
  }
}

/**
 * Direct browser dispatch fallback for static deployments (e.g. GitHub Pages, Vercel SPA, Netlify)
 * where the Node.js Express backend proxy is not active.
 */
async function sendDirectFromBrowser(
  provider: string,
  instanceId: string,
  token: string,
  customUrl: string,
  cleanPhone: string,
  messageText: string
): Promise<{ success: boolean; error?: string; rawResponse?: any }> {
  try {
    let url = '';
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any = {};

    if (provider === 'wapi') {
      if (customUrl) {
        url = customUrl.includes('instanceId=') 
          ? customUrl 
          : `${customUrl.replace(/\/$/, '')}/v1/message/send-text?instanceId=${instanceId}`;
      } else {
        url = `https://api.w-api.app/v1/message/send-text?instanceId=${instanceId}`;
      }
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      headers['instanceId'] = instanceId;
      body = { 
        phone: cleanPhone, 
        message: messageText,
        instanceId: instanceId
      };
    } else if (provider === 'zapi') {
      url = customUrl || `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
      headers['Client-Token'] = token;
      body = { phone: cleanPhone, message: messageText };
    } else if (provider === 'evolution') {
      const base = customUrl ? customUrl.replace(/\/$/, '') : 'https://sua-evolution.com.br';
      url = `${base}/message/sendText/${instanceId}`;
      headers['apikey'] = token;
      body = { number: cleanPhone, text: messageText };
    } else if (provider === 'ultramsg') {
      url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
      const form = new URLSearchParams();
      form.append('token', token);
      form.append('to', cleanPhone);
      form.append('body', messageText);
      const uRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      const uData = await uRes.json().catch(() => null);
      if (uRes.ok && (uData?.sent === 'true' || uData?.id)) {
        return { success: true, rawResponse: uData };
      }
      return { success: false, error: uData?.error || `Erro UltraMsg Direct HTTP ${uRes.status}` };
    } else if (provider === 'meta_cloud') {
      url = customUrl || `https://graph.facebook.com/v20.0/${instanceId}/messages`;
      headers['Authorization'] = `Bearer ${token}`;
      body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: { preview_url: false, body: messageText }
      };
    } else if (provider === 'custom' && customUrl) {
      url = customUrl;
      body = { phone: cleanPhone, message: messageText };
    } else {
      return { success: false, error: 'Provedor não suportado para envio direto do navegador.' };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const data = await res.json().catch(() => null);
    if (res.ok) {
      return { success: true, rawResponse: data };
    }
    const errMsg = data?.message || data?.error?.message || data?.error || `HTTP ${res.status}`;
    return { success: false, error: `Erro no provedor ${provider.toUpperCase()}: ${errMsg}` };
  } catch (err: any) {
    return { 
      success: false, 
      error: `Falha no envio direto pelo navegador (${err?.message || 'CORS ou Bloqueio de Rede'}). Verifique se a sua hospedagem está rodando o comando 'npm start'.` 
    };
  }
}

/**
 * Send a message using the barbershop's specific WhatsApp API gateway configuration.
 */
export async function sendWhatsAppApiMessage(
  config: WhatsAppConfig,
  recipientPhone: string,
  messageText: string
): Promise<{ success: boolean; error?: string; rawResponse?: any }> {
  if (!config || !config.enabled) {
    return { success: false, error: 'Integração de WhatsApp desativada nesta barbearia.' };
  }

  const cleanPhone = formatWhatsAppPhone(recipientPhone);
  if (!cleanPhone) {
    return { success: false, error: 'Telefone do destinatário é inválido.' };
  }

  const provider = config.provider || 'meta_cloud';
  const instanceId = (config.instanceId || '').trim();
  const token = (config.token || '').trim();
  const customUrl = (config.apiUrl || '').trim();

  // If using wa_link provider (Free 1-Click WhatsApp Web)
  if (provider === 'wa_link') {
    openWhatsAppDirect(cleanPhone, messageText);
    return { success: true };
  }

  // Send via Backend Express Proxy (Bypasses browser CORS & network restrictions)
  try {
    let proxyRes = await fetch('/api/whatsapp/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        instanceId,
        token,
        customUrl,
        recipientPhone: cleanPhone,
        messageText
      })
    });

    // Dual fallback: If 404 or failed, try alternative alias /api/proxy/whatsapp
    if (proxyRes.status === 404) {
      try {
        const altRes = await fetch('/api/proxy/whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            instanceId,
            token,
            customUrl,
            recipientPhone: cleanPhone,
            messageText
          })
        });
        if (altRes.ok || altRes.status < 500) {
          proxyRes = altRes;
        }
      } catch (_) {}
    }

    const proxyData = await proxyRes.json().catch(() => null);

    if (proxyData && proxyData.success) {
      return { success: true, rawResponse: proxyData.data };
    } 
    
    if (proxyData && proxyData.error) {
      return { success: false, error: proxyData.error, rawResponse: proxyData };
    }

    // If backend returned 404 (e.g. deployed on static GitHub Pages or Vercel without backend server)
    if (proxyRes.status === 404 || !proxyData) {
      console.warn('[WhatsApp] Servidor proxy não encontrado (hospedagem estática detectada). Tentando envio direto do navegador...');
      const directAttempt = await sendDirectFromBrowser(provider, instanceId, token, customUrl, cleanPhone, messageText);
      if (directAttempt.success) {
        return directAttempt;
      }
      return { 
        success: false, 
        error: directAttempt.error || `Servidor proxy backend não encontrado (HTTP 404). Se você hospedou no GitHub/Vercel/Render, certifique-se de configurar o comando 'npm start' ou utilizar o modo 'WhatsApp Web Direto'.` 
      };
    }

    return { success: false, error: 'Resposta inesperada do servidor de WhatsApp.' };
  } catch (proxyErr: any) {
    console.warn('[WhatsApp] Erro ao contatar backend, tentando envio direto do navegador:', proxyErr);
    // Attempt direct browser dispatch as fallback
    const directAttempt = await sendDirectFromBrowser(provider, instanceId, token, customUrl, cleanPhone, messageText);
    if (directAttempt.success) {
      return directAttempt;
    }
    return { 
      success: false, 
      error: `Falha de conexão: ${proxyErr?.message || 'Erro de rede'}. (${directAttempt.error || ''})` 
    };
  }
}

/**
 * Creates a formatted log entry for the WhatsApp dispatch history.
 */
export function createDispatchLog(
  type: 'reminder' | 'billing' | 'winback' | 'test',
  clientName: string,
  clientPhone: string,
  status: 'success' | 'error',
  messagePreview: string,
  errorMessage?: string
): WhatsAppDispatchLog {
  return {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    type,
    clientName,
    clientPhone,
    status,
    messagePreview: messagePreview.length > 80 ? messagePreview.substring(0, 80) + '...' : messagePreview,
    errorMessage
  };
}
