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
      ai_chat_messages: {
        Row: {
          content: string
          created_at: string
          document_id: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          document_id?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          facade_id: string | null
          floor_number: number | null
          id: string
          is_read: boolean
          is_resolved: boolean
          photo_urls: string[] | null
          priority: string
          project_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_task_id: string | null
          target_roles: Database["public"]["Enums"]["app_role"][] | null
          title: string
          type: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          facade_id?: string | null
          floor_number?: number | null
          id?: string
          is_read?: boolean
          is_resolved?: boolean
          photo_urls?: string[] | null
          priority?: string
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_task_id?: string | null
          target_roles?: Database["public"]["Enums"]["app_role"][] | null
          title: string
          type?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          facade_id?: string | null
          floor_number?: number | null
          id?: string
          is_read?: boolean
          is_resolved?: boolean
          photo_urls?: string[] | null
          priority?: string
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_task_id?: string | null
          target_roles?: Database["public"]["Enums"]["app_role"][] | null
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
            foreignKeyName: "alerts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_source_task_id_fkey"
            columns: ["source_task_id"]
            isOneToOne: false
            referencedRelation: "ecosystem_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          created_at: string
          facade_id: string | null
          foreman_name: string | null
          foreman_user_id: string | null
          headcount: number
          id: string
          is_active: boolean
          name: string
          project_id: string | null
          specialization: string | null
        }
        Insert: {
          created_at?: string
          facade_id?: string | null
          foreman_name?: string | null
          foreman_user_id?: string | null
          headcount?: number
          id?: string
          is_active?: boolean
          name: string
          project_id?: string | null
          specialization?: string | null
        }
        Update: {
          created_at?: string
          facade_id?: string | null
          foreman_name?: string | null
          foreman_user_id?: string | null
          headcount?: number
          id?: string
          is_active?: boolean
          name?: string
          project_id?: string | null
          specialization?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crews_facade_id_fkey"
            columns: ["facade_id"]
            isOneToOne: false
            referencedRelation: "facades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folders: {
        Row: {
          created_at: string
          department: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          project_id: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          department: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          project_id?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          department?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          project_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          ai_summary: string | null
          category: string | null
          created_at: string
          file_size: number | null
          file_type: string
          file_url: string
          folder_id: string | null
          id: string
          name: string
          parsed_text: string | null
          project_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          ai_summary?: string | null
          category?: string | null
          created_at?: string
          file_size?: number | null
          file_type?: string
          file_url: string
          folder_id?: string | null
          id?: string
          name: string
          parsed_text?: string | null
          project_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          ai_summary?: string | null
          category?: string | null
          created_at?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          folder_id?: string | null
          id?: string
          name?: string
          parsed_text?: string | null
          project_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ecosystem_tasks: {
        Row: {
          assigned_to: string | null
          block: string
          code: string
          created_at: string
          department: string
          dependency_ids: string | null
          duration_days: number | null
          facade_id: string | null
          id: string
          input_document: string | null
          name: string
          notes: string | null
          notification_type: string | null
          output_document: string | null
          planned_date: string | null
          priority: string
          progress: number
          project_id: string | null
          recipient: string | null
          responsible: string | null
          status: string
          task_number: number
          trigger_text: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          block: string
          code: string
          created_at?: string
          department: string
          dependency_ids?: string | null
          duration_days?: number | null
          facade_id?: string | null
          id?: string
          input_document?: string | null
          name: string
          notes?: string | null
          notification_type?: string | null
          output_document?: string | null
          planned_date?: string | null
          priority?: string
          progress?: number
          project_id?: string | null
          recipient?: string | null
          responsible?: string | null
          status?: string
          task_number: number
          trigger_text?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          block?: string
          code?: string
          created_at?: string
          department?: string
          dependency_ids?: string | null
          duration_days?: number | null
          facade_id?: string | null
          id?: string
          input_document?: string | null
          name?: string
          notes?: string | null
          notification_type?: string | null
          output_document?: string | null
          planned_date?: string | null
          priority?: string
          progress?: number
          project_id?: string | null
          recipient?: string | null
          responsible?: string | null
          status?: string
          task_number?: number
          trigger_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecosystem_tasks_facade_id_fkey"
            columns: ["facade_id"]
            isOneToOne: false
            referencedRelation: "facades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecosystem_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      facades: {
        Row: {
          axes: string | null
          code: string | null
          created_at: string
          floors_count: number
          id: string
          name: string
          project_id: string | null
          total_modules: number
        }
        Insert: {
          axes?: string | null
          code?: string | null
          created_at?: string
          floors_count?: number
          id?: string
          name: string
          project_id?: string | null
          total_modules?: number
        }
        Update: {
          axes?: string | null
          code?: string | null
          created_at?: string
          floors_count?: number
          id?: string
          name?: string
          project_id?: string | null
          total_modules?: number
        }
        Relationships: [
          {
            foreignKeyName: "facades_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      floors: {
        Row: {
          brackets_fact: number
          brackets_plan: number
          elevation: string | null
          facade_id: string
          floor_number: number
          id: string
          module_height: number | null
          module_type: string | null
          module_width: number | null
          modules_fact: number
          modules_plan: number
          photo_urls: string[] | null
          sealant_fact: number
          sealant_plan: number
          status: string
          updated_at: string
        }
        Insert: {
          brackets_fact?: number
          brackets_plan?: number
          elevation?: string | null
          facade_id: string
          floor_number: number
          id?: string
          module_height?: number | null
          module_type?: string | null
          module_width?: number | null
          modules_fact?: number
          modules_plan?: number
          photo_urls?: string[] | null
          sealant_fact?: number
          sealant_plan?: number
          status?: string
          updated_at?: string
        }
        Update: {
          brackets_fact?: number
          brackets_plan?: number
          elevation?: string | null
          facade_id?: string
          floor_number?: number
          id?: string
          module_height?: number | null
          module_type?: string | null
          module_width?: number | null
          modules_fact?: number
          modules_plan?: number
          photo_urls?: string[] | null
          sealant_fact?: number
          sealant_plan?: number
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
      materials: {
        Row: {
          category: string | null
          deficit: number
          eta: string | null
          id: string
          in_production: number
          installed: number
          name: string
          on_site: number
          order_date: string | null
          ordered: number
          project_id: string | null
          shipped: number
          status: string
          supplier: string | null
          total_required: number
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          deficit?: number
          eta?: string | null
          id?: string
          in_production?: number
          installed?: number
          name: string
          on_site?: number
          order_date?: string | null
          ordered?: number
          project_id?: string | null
          shipped?: number
          status?: string
          supplier?: string | null
          total_required?: number
          unit: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          deficit?: number
          eta?: string | null
          id?: string
          in_production?: number
          installed?: number
          name?: string
          on_site?: number
          order_date?: string | null
          ordered?: number
          project_id?: string | null
          shipped?: number
          status?: string
          supplier?: string | null
          total_required?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_fact: {
        Row: {
          created_at: string
          crew_id: string | null
          date: string
          facade_id: string | null
          fact_value: number
          floor_id: string | null
          id: string
          notes: string | null
          photo_urls: string[] | null
          plan_value: number
          project_id: string | null
          reported_by: string | null
          updated_at: string
          week_number: number
          work_type_id: string | null
        }
        Insert: {
          created_at?: string
          crew_id?: string | null
          date: string
          facade_id?: string | null
          fact_value?: number
          floor_id?: string | null
          id?: string
          notes?: string | null
          photo_urls?: string[] | null
          plan_value?: number
          project_id?: string | null
          reported_by?: string | null
          updated_at?: string
          week_number: number
          work_type_id?: string | null
        }
        Update: {
          created_at?: string
          crew_id?: string | null
          date?: string
          facade_id?: string | null
          fact_value?: number
          floor_id?: string | null
          id?: string
          notes?: string | null
          photo_urls?: string[] | null
          plan_value?: number
          project_id?: string | null
          reported_by?: string | null
          updated_at?: string
          week_number?: number
          work_type_id?: string | null
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
            foreignKeyName: "plan_fact_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          pin_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          pin_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          pin_hash?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_chats: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          project_id: string
          sort_order: number | null
          telegram_link: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          name: string
          project_id: string
          sort_order?: number | null
          telegram_link: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          sort_order?: number | null
          telegram_link?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_chats_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          city: string | null
          client_account: string | null
          client_actual_address: string | null
          client_bank: string | null
          client_director: string | null
          client_email: string | null
          client_inn: string | null
          client_kpp: string | null
          client_legal_address: string | null
          client_name: string | null
          client_ogrn: string | null
          client_phone: string | null
          code: string | null
          contacts: Json | null
          created_at: string
          created_by: string | null
          duration_days: number | null
          end_date: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          photo_url: string | null
          start_date: string | null
          status: string
          updated_at: string
          work_type: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_account?: string | null
          client_actual_address?: string | null
          client_bank?: string | null
          client_director?: string | null
          client_email?: string | null
          client_inn?: string | null
          client_kpp?: string | null
          client_legal_address?: string | null
          client_name?: string | null
          client_ogrn?: string | null
          client_phone?: string | null
          code?: string | null
          contacts?: Json | null
          created_at?: string
          created_by?: string | null
          duration_days?: number | null
          end_date?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          photo_url?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          work_type?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          client_account?: string | null
          client_actual_address?: string | null
          client_bank?: string | null
          client_director?: string | null
          client_email?: string | null
          client_inn?: string | null
          client_kpp?: string | null
          client_legal_address?: string | null
          client_name?: string | null
          client_ogrn?: string | null
          client_phone?: string | null
          code?: string | null
          contacts?: Json | null
          created_at?: string
          created_by?: string | null
          duration_days?: number | null
          end_date?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          photo_url?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          work_type?: string
        }
        Relationships: []
      }
      shipments: {
        Row: {
          batch_number: string | null
          created_at: string
          defect_count: number | null
          defect_notes: string | null
          eta: string | null
          id: string
          material_id: string
          notes: string | null
          quality_status: string | null
          quantity: number
          received_at: string | null
          shipped_at: string | null
          status: string
        }
        Insert: {
          batch_number?: string | null
          created_at?: string
          defect_count?: number | null
          defect_notes?: string | null
          eta?: string | null
          id?: string
          material_id: string
          notes?: string | null
          quality_status?: string | null
          quantity: number
          received_at?: string | null
          shipped_at?: string | null
          status?: string
        }
        Update: {
          batch_number?: string | null
          created_at?: string
          defect_count?: number | null
          defect_notes?: string | null
          eta?: string | null
          id?: string
          material_id?: string
          notes?: string | null
          quality_status?: string | null
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
          column_mapping: Json | null
          created_at: string
          created_by: string | null
          direction: string
          id: string
          is_active: boolean
          last_error: string | null
          last_synced_at: string | null
          sheet_id: string
          sheet_name: string
          sync_interval_minutes: number | null
          target_table: string
        }
        Insert: {
          column_mapping?: Json | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_synced_at?: string | null
          sheet_id: string
          sheet_name: string
          sync_interval_minutes?: number | null
          target_table: string
        }
        Update: {
          column_mapping?: Json | null
          created_at?: string
          created_by?: string | null
          direction?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_synced_at?: string | null
          sheet_id?: string
          sheet_name?: string
          sync_interval_minutes?: number | null
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
          created_at: string
          duration_days: number | null
          end_date: string | null
          facade_id: string | null
          id: string
          name: string
          project_id: string | null
          section: string
          sort_number: number | null
          start_date: string | null
          subsection: string | null
          unit: string
          volume: number | null
          workers_count: number | null
        }
        Insert: {
          created_at?: string
          duration_days?: number | null
          end_date?: string | null
          facade_id?: string | null
          id?: string
          name: string
          project_id?: string | null
          section: string
          sort_number?: number | null
          start_date?: string | null
          subsection?: string | null
          unit: string
          volume?: number | null
          workers_count?: number | null
        }
        Update: {
          created_at?: string
          duration_days?: number | null
          end_date?: string | null
          facade_id?: string | null
          id?: string
          name?: string
          project_id?: string | null
          section?: string
          sort_number?: number | null
          start_date?: string | null
          subsection?: string | null
          unit?: string
          volume?: number | null
          workers_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "work_types_facade_id_fkey"
            columns: ["facade_id"]
            isOneToOne: false
            referencedRelation: "facades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_types_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      seed_project_folders: {
        Args: { p_project_id: string }
        Returns: undefined
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
