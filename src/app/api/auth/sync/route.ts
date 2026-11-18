import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Call the security definer sync function
    const { data: syncData, error: syncError } = await supabase.rpc("sync_current_user");

    if (syncError) {
      console.warn("sync_current_user RPC notice:", syncError.message);
    }

    // Return the current user profile from public.users
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, email, name, role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (userError || !userData) {
      return NextResponse.json({
        success: false,
        error: "Your profile could not be synchronized. Please contact FSP support.",
        code: syncData?.error ?? "profile_missing",
      }, { status: syncError || userError ? 503 : 409 });
    }
    if(userData.is_active === false) return NextResponse.json({success:false,error:"Account disabled"},{status:403});

    return NextResponse.json({
      success: true,
      user: userData,
      syncResult: syncData
    });
  } catch (err: unknown) {
    console.error("Auth sync error:", err);
    return NextResponse.json({ error: "Profile sync failed. Please try again." }, { status: 500 });
  }
}
