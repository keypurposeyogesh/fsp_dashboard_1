import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json().catch(()=>null);
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.action !== 'string'
      || !/^[A-Z][A-Z0-9_]{0,79}$/.test(body.action)
      || (body.details !== undefined && (body.details === null || typeof body.details !== 'object' || Array.isArray(body.details)))) {
      return NextResponse.json({error:"Invalid activity payload"},{status:400});
    }
    const { action, details } = body;
    if(JSON.stringify(details ?? {}).length>16000)return NextResponse.json({error:"Activity details are too large"},{status:413});

    const headers = request.headers;
    const ipAddress = headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = headers.get("user-agent") || "";

    // For AUTH_LOGIN_FAILED, write log anonymously without auth session context.
    if (action === "AUTH_LOGIN_FAILED") {
      const { error: insertError } = await supabase
        .from("member_activity_logs")
        .insert({
          action: "AUTH_LOGIN_FAILED",
          ip_address: ipAddress,
          user_agent: userAgent,
          metadata: { email: typeof details?.email === 'string' ? details.email.trim().slice(0,255) : "anonymous" },
          created_at: new Date().toISOString()
        });

      if (insertError) {
        console.error("Error logging anonymous failed login:", insertError.message);
        return NextResponse.json({ error: "Database write failure" }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // For authenticated activities: retrieve and verify the active session.
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }
    const {data:profile,error:profileError}=await supabase.from('users').select('is_active').eq('id',user.id).maybeSingle();
    if(profileError || !profile || profile.is_active === false)return NextResponse.json({error:"Active member profile required"},{status:403});

    // Fetch the associated member profile id
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError) {
      console.error("Error checking member profile:", memberError.message);
      return NextResponse.json({ error: "Database look-up failure" }, { status: 500 });
    }

    const { error: logInsertError } = await supabase
      .from("member_activity_logs")
      .insert({
        user_id: user.id,
        member_id: member?.id || null,
        action: action,
        ip_address: ipAddress,
        user_agent: userAgent,
        metadata: details || {},
        created_at: new Date().toISOString()
      });

    if (logInsertError) {
      console.error("Error inserting member activity log:", logInsertError.message);
      return NextResponse.json({ error: "Database write failure" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Fatal activity logging failure:", err);
    return NextResponse.json({ error: "Activity could not be recorded" }, { status: 500 });
  }
}
