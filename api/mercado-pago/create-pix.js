// Vercel Serverless Function for Mercado Pago Pix creation
export default async function handler(req, res) {
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

  const { amount, description, payerEmail, payerFirstName, payerLastName, customToken } = req.body || {};
  const token = (customToken || "").trim() || process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: "Nenhuma credencial do Mercado Pago configurada nesta barbearia."
    });
  }

  try {
    const numAmount = parseFloat(amount);
    const finalAmount = !isNaN(numAmount) && numAmount > 0 ? Number(numAmount.toFixed(2)) : 35.00;

    const email = (payerEmail || "cliente@barberpass.com").trim();
    const cleanEmail = email.includes("@") ? email : "cliente@barberpass.com";

    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      },
      body: JSON.stringify({
        transaction_amount: finalAmount,
        description: description || "Agendamento de Serviço",
        payment_method_id: "pix",
        payer: {
          email: cleanEmail,
          first_name: payerFirstName || "Cliente",
          last_name: payerLastName || "Barbearia"
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(200).json({
        success: false,
        error: data.message || (data.cause && data.cause[0] && data.cause[0].description) || "Falha ao gerar cobrança Pix."
      });
    }

    const txData = data.point_of_interaction?.transaction_data;
    return res.status(200).json({
      success: true,
      paymentId: String(data.id),
      status: data.status,
      qrCodeBase64: txData?.qr_code_base64,
      qrCode: txData?.qr_code,
      ticketUrl: txData?.ticket_url
    });
  } catch (error) {
    return res.status(200).json({
      success: false,
      error: error?.message || "Erro de conexão com Mercado Pago"
    });
  }
}
