export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          facade_id: string | null
          floor_id: string | null
          id: string
          is_read: boolean
          priority: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          facade_id?: string | null
          floor_id?: string | null
          id?: string
          is_read?: boolean
          priority?: string
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          facade_id?: string | null
          floor_id?: string | null
          id?: string
          is_read?: boolean
          priority?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_facade_id_fkey"
            columns: ["facade_id"]
            isOneToOne: false
            referencedRelation: "facades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_assignments: {
        Row: {
          created_at: string
          crew_id: string
          date: string
          facade_id: string | null
          floor_id: string | null
          id: string
          output_value: number
          work_type_id: string | null
          workers_count: number
        }
        Insert: {
          created_at?: string
          crew_id: string
          date: string
          facade_id?: string | null
          floor_id?: string | null
          id?: string
          output_value?: number
          work_type_id?: string | null
          workers_count?: number
        }
        Update: {
          created_at?: string
          crew_id?: string
          date?: string
          facade_id?: string | null
          floor_id?: string | null
          id?: string
          output_value?: number
          work_type_id?: string | null
          workers_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "crew_assignments_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_assignments_facade_id_fkey"
            columns: ["facade_id"]
            isOneToOne: false
            referencedRelation: "facades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_assignments_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_assignments_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          created_at: string
          foreman: string | null
          headcount: number
          id: string
          name: string
          specialization: string | null
        }
        Insert: {
          created_at?: string
          foreman?: string | null
          headcount?: number
          id?: string
          name: string
          specialization?: string | null
        }
        Update: {
          created_at?: string
          foreman?: string | null
          headcount?: number
          id?: string
          name?: string
          specialization?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          file_type: string
          file_url: string
          id: string
          name: string
          parsed_text: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_type?: string
          file_url: string
          id?: string
          name: string
          parsed_text?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_type?: string
          file_url?: string
          id?: string
          name?: string
          parsed_text?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      facades: {
        Row: {
          created_at: string
          id: string
          name: string
          total_modules: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          total_modules?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          total_modules?: number
        }
        Relationships: []
      }
      floors: {
        Row: {
          facade_id: string
          floor_number: number
          id: string
          modules_fact: number
          modules_plan: number
          status: string
          updated_at: string
        }
        Insert: {
          facade_id: string
          floor_number: number
          id?: string
          modules_fact?: number
          modules_plan?: number
          status?: string
          updated_at?: string
        }
        Update: {
          facade_id?: string
          floor_number?: number
          id?: string
          modules_fact?: number
          modules_plan?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floors_facade_id_fkey"
            columns: ["facade_id"]
            isOneToOne: false
            referencedRelation: "facades"
            referencedColumns: ["id"]
          },
        ]
      }
      gpr_tasks: {
        Row: {
          created_at: string
          end_date: string
          facade_id: string | null
          id: string
          name: string
          parent_id: string | null
          progress: number
          sort_order: number
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          facade_id?: string | null
          id?: string
          name: string
          parent_id?: string | null
          progress?: number
          sort_order?: number
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          facade_id?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          progress?: number
          sort_order?: number
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gpr_tasks_facade_id_fkey"
            columns: ["facade_id"]
            isOneToOne: false
            referencedRelation: "facades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gpr_tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "gpr_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          deficit: number
          id: string
          in_stock: number
          in_transit: number
          name: string
          status: string
          total_required: number
          unit: string
          updated_at: string
        }
        Insert: {
          deficit?: number
          id?: string
          in_stock?: number
          in_transit?: number
          name: string
          status?: string
          total_required?: number
          unit: string
          updated_at?: string
        }
        Update: {
          deficit?: number
          id?: string
          in_stock?: number
          in_transit?: number
          name?: string
          status?: string
          total_required?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_fact: {
        Row: {
          created_at: string
          date: string
          facade_id: string | null
          fact_value: number
          floor_id: string | null
          id: string
          plan_value: number
          reported_by: string | null
          updated_at: string
          week_number: number
          work_type_id: string
        }
        Insert: {
          created_at?: string
          date: string
          facade_id?: string | null
          fact_value?: number
          floor_id?: string | null
          id?: string
          plan_value?: number
          reported_by?: string | null
          updated_at?: string
          week_number: number
          work_type_id: string
        }
        Update: {
          created_at?: string
          date?: string
          facade_id?: string | null
          fact_value?: number
          floor_id?: string | null
          id?: string
          plan_value?: number
          reported_by?: string | null
          updated_at?: string
          week_number?: number
          work_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_fact_facade_id_fkey"
            columns: ["facade_id"]
            isOneToOne: false
            referencedRelation: "facades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_fact_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_fact_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          pin_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          pin_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          pin_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shipments: {
        Row: {
          created_at: string
          eta: string | null
          id: string
          material_id: string
          notes: string | null
          quantity: number
          received_at: string | null
          shipped_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          eta?: string | null
          id?: string
          material_id: string
          notes?: string | null
          quantity: number
          received_at?: string | null
          shipped_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          eta?: string | null
          id?: string
          material_id?: string
          notes?: string | null
          quantity?: number
          received_at?: string | null
          shipped_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_config: {
        Row: {
          created_at: string
          direction: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          sheet_id: string
          sheet_name: string
          target_table: string
        }
        Insert: {
          created_at?: string
          direction?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          sheet_id: string
          sheet_name: string
          target_table: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          sheet_id?: string
          sheet_name?: string
          target_table?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_types: {
        Row: {
          id: string
          name: string
          sort_order: number
          unit: string
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
          unit: string
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
          unit?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "director"
        | "pm"
        | "project"
        | "supply"
        | "production"
        | "foreman1"
        | "foreman2"
        | "foreman3"
        | "pto"
        | "inspector"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "director",
        "pm",
        "project",
        "supply",
        "production",
        "foreman1",
        "foreman2",
        "foreman3",
        "pto",
        "inspector",
      ],
    },
  },
} as const
