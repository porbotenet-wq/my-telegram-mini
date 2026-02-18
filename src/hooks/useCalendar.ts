import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CalendarEvent } from "@/types/database";

export function useCalendarEvents(projectId: string) {
  return useQuery({
    queryKey: ["calendar", projectId],
    queryFn: async (): Promise<CalendarEvent[]> => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("project_id", projectId)
        .order("date");
      if (error) throw error;
      return (data as CalendarEvent[]) || [];
    },
    enabled: !!projectId,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (event: Partial<CalendarEvent>) => {
      const { error } = await supabase.from("calendar_events").insert(event as any);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["calendar", variables.project_id] });
    },
  });
}
