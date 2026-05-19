import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase service role configuration.");
    }

    const { userId } = await req.json();
    if (!userId) throw new Error("User id is required.");

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const cleanupSteps = [
      admin.from("projects").update({ created_by: null }).eq("created_by", userId),
      admin.from("tasks").update({ created_by: null }).eq("created_by", userId),
      admin.from("comments").update({ profile_id: null }).eq("profile_id", userId),
    ];

    const cleanupResults = await Promise.all(cleanupSteps);
    const cleanupError = cleanupResults.find(result => result.error)?.error;
    if (cleanupError) throw cleanupError;

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("admin-delete-user failed", error);

    return new Response(JSON.stringify({ error: error.message || "User deletion failed." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
