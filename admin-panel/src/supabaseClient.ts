import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ndfruhzyxqtuilekaorp.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kZnJ1aHp5eHF0dWlsZWthb3JwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwODQzNDYsImV4cCI6MjA5MzY2MDM0Nn0.7kRy3T52IGOEpyQGSANvmio0QWa14HQXHTNLBshMb-Y";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
