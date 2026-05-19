import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const payload = await req.json();

    if (!payload.email || !payload.password) {
      throw new Error("Email and password are required.");
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        legal_name: payload.legalName,
        display_name: payload.displayName,
        role: payload.role,
      },
    });

    if (authError) throw authError;
    const user = authData.user;

    const { error: profileError } = await admin.from("profiles").upsert({
      id: user.id,
      legal_name: payload.legalName,
      display_name: payload.displayName,
      email: payload.email,
      phone: payload.phone,
      work_phone: payload.workPhone,
      gender: payload.gender,
      dob: payload.dob,
      home_address: payload.homeAddress,
      photo_url: payload.photoUrl,
      role: payload.role || "User",
      status: payload.status || "Active",
    });

    if (profileError) throw profileError;

    const groupIds = Array.isArray(payload.groupIds)
      ? payload.groupIds.filter((groupId: unknown) => typeof groupId === "string" && uuidPattern.test(groupId))
      : [];

    if (groupIds.length) {
      const { data: groups, error: groupsError } = await admin
        .from("groups")
        .select("id")
        .in("id", groupIds);
      if (groupsError) throw groupsError;

      const existingGroupIds = new Set((groups || []).map(group => group.id));
      const groupRows = groupIds.filter(groupId => existingGroupIds.has(groupId)).map((groupId: string) => ({
        group_id: groupId,
        profile_id: user.id,
      }));
      if (groupRows.length) {
        const { error: groupError } = await admin.from("group_members").upsert(groupRows);
        if (groupError) throw groupError;
      }
    }

    return new Response(JSON.stringify({ user }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
