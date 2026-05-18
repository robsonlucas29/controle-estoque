import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ecpqedyihlqkknkqnpsq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjcHFlZHlpaGxxa2tua3FucHNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NjkxMjgsImV4cCI6MjA5NDM0NTEyOH0.W7MqSbTUAm1I8fl-u9fRvDCnRmwauZyI4qox9IpXNQ8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
