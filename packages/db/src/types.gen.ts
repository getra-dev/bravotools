export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          org_id: string
          payload: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          org_id: string
          payload?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          org_id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_access_log: {
        Row: {
          accessed_at: string
          admin_user_id: string
          id: string
          org_id: string
          reason: string
        }
        Insert: {
          accessed_at?: string
          admin_user_id: string
          id?: string
          org_id: string
          reason: string
        }
        Update: {
          accessed_at?: string
          admin_user_id?: string
          id?: string
          org_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_access_log_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "platform_admins"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_access_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_mentions: {
        Row: {
          comment_id: string
          mentioned_user_id: string
        }
        Insert: {
          comment_id: string
          mentioned_user_id: string
        }
        Update: {
          comment_id?: string
          mentioned_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          audio_path: string | null
          author_id: string | null
          author_type: string
          body: string
          created_at: string
          edited_at: string | null
          entity_id: string
          entity_type: string
          id: string
          org_id: string
          photo_path: string | null
        }
        Insert: {
          audio_path?: string | null
          author_id?: string | null
          author_type?: string
          body: string
          created_at?: string
          edited_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          org_id: string
          photo_path?: string | null
        }
        Update: {
          audio_path?: string | null
          author_id?: string | null
          author_type?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          org_id?: string
          photo_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_issues: {
        Row: {
          created_at: string
          delivery_task_id: string | null
          description: string | null
          id: string
          issue_type: string
          order_item_id: string | null
          org_id: string
          photo_path: string | null
          qty_affected: number | null
          reported_by: string
          resolution_note: string | null
          status: string
        }
        Insert: {
          created_at?: string
          delivery_task_id?: string | null
          description?: string | null
          id?: string
          issue_type: string
          order_item_id?: string | null
          org_id: string
          photo_path?: string | null
          qty_affected?: number | null
          reported_by: string
          resolution_note?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          delivery_task_id?: string | null
          description?: string | null
          id?: string
          issue_type?: string
          order_item_id?: string | null
          org_id?: string
          photo_path?: string | null
          qty_affected?: number | null
          reported_by?: string
          resolution_note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_issues_delivery_task_id_fkey"
            columns: ["delivery_task_id"]
            isOneToOne: false
            referencedRelation: "delivery_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_issues_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_issues_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_issues_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_via: string
          delivered_at: string | null
          delivery_method: string
          dropoff_location_id: string
          est_volume_m3: number | null
          est_weight_kg: number | null
          id: string
          notes: string | null
          order_id: string | null
          org_id: string
          picked_up_at: string | null
          pickup_document_path: string | null
          pickup_location_id: string
          priority: string
          requires_crane: boolean
          scheduled_date: string | null
          status: string
          tool_id: string | null
          trip_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_via?: string
          delivered_at?: string | null
          delivery_method?: string
          dropoff_location_id: string
          est_volume_m3?: number | null
          est_weight_kg?: number | null
          id?: string
          notes?: string | null
          order_id?: string | null
          org_id: string
          picked_up_at?: string | null
          pickup_document_path?: string | null
          pickup_location_id: string
          priority?: string
          requires_crane?: boolean
          scheduled_date?: string | null
          status?: string
          tool_id?: string | null
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_via?: string
          delivered_at?: string | null
          delivery_method?: string
          dropoff_location_id?: string
          est_volume_m3?: number | null
          est_weight_kg?: number | null
          id?: string
          notes?: string | null
          order_id?: string | null
          org_id?: string
          picked_up_at?: string | null
          pickup_document_path?: string | null
          pickup_location_id?: string
          priority?: string
          requires_crane?: boolean
          scheduled_date?: string | null
          status?: string
          tool_id?: string | null
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tasks_dropoff_location_id_fkey"
            columns: ["dropoff_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tasks_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tasks_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tasks_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "vehicle_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tasks_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_persons: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          org_id: string
          phone: string | null
          position: string | null
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          org_id: string
          phone?: string | null
          position?: string | null
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          org_id?: string
          phone?: string | null
          position?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_persons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_external_vendor"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_logs: {
        Row: {
          cost: number | null
          driver_id: string | null
          filled_at: string
          id: string
          liters: number
          notes: string | null
          odometer: number | null
          org_id: string
          receipt_photo_path: string | null
          tool_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          cost?: number | null
          driver_id?: string | null
          filled_at?: string
          id?: string
          liters: number
          notes?: string | null
          odometer?: number | null
          org_id: string
          receipt_photo_path?: string | null
          tool_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          cost?: number | null
          driver_id?: string | null
          filled_at?: string
          id?: string
          liters?: number
          notes?: string | null
          odometer?: number | null
          org_id?: string
          receipt_photo_path?: string | null
          tool_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_logs_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_acts: {
        Row: {
          act_number: string
          created_at: string
          external_receiver_id: string | null
          giver_id: string | null
          giver_signature_path: string | null
          giver_signed_at: string | null
          id: string
          movement_id: string
          org_id: string
          pdf_storage_path: string | null
          receiver_id: string | null
          receiver_signature_path: string | null
          receiver_signed_at: string | null
          status: string
        }
        Insert: {
          act_number: string
          created_at?: string
          external_receiver_id?: string | null
          giver_id?: string | null
          giver_signature_path?: string | null
          giver_signed_at?: string | null
          id?: string
          movement_id: string
          org_id: string
          pdf_storage_path?: string | null
          receiver_id?: string | null
          receiver_signature_path?: string | null
          receiver_signed_at?: string | null
          status?: string
        }
        Update: {
          act_number?: string
          created_at?: string
          external_receiver_id?: string | null
          giver_id?: string | null
          giver_signature_path?: string | null
          giver_signed_at?: string | null
          id?: string
          movement_id?: string
          org_id?: string
          pdf_storage_path?: string | null
          receiver_id?: string | null
          receiver_signature_path?: string | null
          receiver_signed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "handover_acts_external_receiver_id_fkey"
            columns: ["external_receiver_id"]
            isOneToOne: false
            referencedRelation: "external_persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_acts_giver_id_fkey"
            columns: ["giver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_acts_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "tool_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_acts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_acts_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_schedules: {
        Row: {
          certificate_path: string | null
          id: string
          inspection_type: string
          interval_hours: number | null
          interval_months: number | null
          last_done: string | null
          last_done_at_hours: number | null
          next_due: string | null
          next_due_at_hours: number | null
          notes: string | null
          org_id: string
          tool_id: string
        }
        Insert: {
          certificate_path?: string | null
          id?: string
          inspection_type: string
          interval_hours?: number | null
          interval_months?: number | null
          last_done?: string | null
          last_done_at_hours?: number | null
          next_due?: string | null
          next_due_at_hours?: number | null
          notes?: string | null
          org_id: string
          tool_id: string
        }
        Update: {
          certificate_path?: string | null
          id?: string
          inspection_type?: string
          interval_hours?: number | null
          interval_months?: number | null
          last_done?: string | null
          last_done_at_hours?: number | null
          next_due?: string | null
          next_due_at_hours?: number | null
          notes?: string | null
          org_id?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_schedules_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_invoice_lines: {
        Row: {
          amount: number
          days_used: number
          id: string
          invoice_id: string
          period_end: string
          period_start: string
          rate_daily: number
          tool_id: string
        }
        Insert: {
          amount: number
          days_used: number
          id?: string
          invoice_id: string
          period_end: string
          period_start: string
          rate_daily: number
          tool_id: string
        }
        Update: {
          amount?: number
          days_used?: number
          id?: string
          invoice_id?: string
          period_end?: string
          period_start?: string
          rate_daily?: number
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "internal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_invoice_lines_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_invoices: {
        Row: {
          created_at: string
          id: string
          invoice_number: string
          org_id: string
          pdf_storage_path: string | null
          period_end: string
          period_start: string
          site_id: string
          status: string
          total_amount: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_number: string
          org_id: string
          pdf_storage_path?: string | null
          period_end: string
          period_start: string
          site_id: string
          status?: string
          total_amount?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          invoice_number?: string
          org_id?: string
          pdf_storage_path?: string | null
          period_end?: string
          period_start?: string
          site_id?: string
          status?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_invoices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_scans: {
        Row: {
          expected_location_id: string | null
          id: string
          result: string
          scanned_at: string
          scanned_by: string
          session_id: string
          tool_id: string
        }
        Insert: {
          expected_location_id?: string | null
          id?: string
          result: string
          scanned_at?: string
          scanned_by: string
          session_id: string
          tool_id: string
        }
        Update: {
          expected_location_id?: string | null
          id?: string
          result?: string
          scanned_at?: string
          scanned_by?: string
          session_id?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_scans_expected_location_id_fkey"
            columns: ["expected_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_scans_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_scans_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inventory_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_scans_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sessions: {
        Row: {
          closed_at: string | null
          id: string
          location_id: string
          org_id: string
          report: Json | null
          started_at: string
          started_by: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          id?: string
          location_id: string
          org_id: string
          report?: Json | null
          started_at?: string
          started_by: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          id?: string
          location_id?: string
          org_id?: string
          report?: Json | null
          started_at?: string
          started_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sessions_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          org_id: string
          type: string
          vendor_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          org_id: string
          type?: string
          vendor_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          org_id?: string
          type?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      material_aliases: {
        Row: {
          alias: string
          confirmed: boolean
          id: string
          material_id: string
          org_id: string
          source: string
        }
        Insert: {
          alias: string
          confirmed?: boolean
          id?: string
          material_id: string
          org_id: string
          source?: string
        }
        Update: {
          alias?: string
          confirmed?: boolean
          id?: string
          material_id?: string
          org_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_aliases_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_aliases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      material_packages: {
        Row: {
          id: string
          material_id: string
          package_name: string
          qty_in_base: number
        }
        Insert: {
          id?: string
          material_id: string
          package_name: string
          qty_in_base: number
        }
        Update: {
          id?: string
          material_id?: string
          package_name?: string
          qty_in_base?: number
        }
        Relationships: [
          {
            foreignKeyName: "material_packages_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      material_request_items: {
        Row: {
          base_qty: number | null
          duplicate_resolution: string | null
          flagged_duplicate_of: string | null
          id: string
          match_confidence: number | null
          material_id: string | null
          notes: string | null
          order_item_id: string | null
          qty: number | null
          raw_text: string
          request_id: string
          status: string
          unit: string | null
        }
        Insert: {
          base_qty?: number | null
          duplicate_resolution?: string | null
          flagged_duplicate_of?: string | null
          id?: string
          match_confidence?: number | null
          material_id?: string | null
          notes?: string | null
          order_item_id?: string | null
          qty?: number | null
          raw_text: string
          request_id: string
          status?: string
          unit?: string | null
        }
        Update: {
          base_qty?: number | null
          duplicate_resolution?: string | null
          flagged_duplicate_of?: string | null
          id?: string
          match_confidence?: number | null
          material_id?: string | null
          notes?: string | null
          order_item_id?: string | null
          qty?: number | null
          raw_text?: string
          request_id?: string
          status?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_request_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "material_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requests: {
        Row: {
          created_at: string
          hot_reason: string | null
          id: string
          is_hot: boolean
          needed_by: string | null
          org_id: string
          requested_by: string
          site_id: string
          status: string
        }
        Insert: {
          created_at?: string
          hot_reason?: string | null
          id?: string
          is_hot?: boolean
          needed_by?: string | null
          org_id: string
          requested_by: string
          site_id: string
          status?: string
        }
        Update: {
          created_at?: string
          hot_reason?: string | null
          id?: string
          is_hot?: boolean
          needed_by?: string | null
          org_id?: string
          requested_by?: string
          site_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          base_unit: string
          canonical_name: string
          category: string | null
          created_at: string
          handling: string | null
          id: string
          max_length_m: number | null
          notes: string | null
          org_id: string
          unit_volume_m3: number | null
          unit_weight_kg: number | null
        }
        Insert: {
          base_unit?: string
          canonical_name: string
          category?: string | null
          created_at?: string
          handling?: string | null
          id?: string
          max_length_m?: number | null
          notes?: string | null
          org_id: string
          unit_volume_m3?: number | null
          unit_weight_kg?: number | null
        }
        Update: {
          base_unit?: string
          canonical_name?: string
          category?: string | null
          created_at?: string
          handling?: string | null
          id?: string
          max_length_m?: number | null
          notes?: string | null
          org_id?: string
          unit_volume_m3?: number | null
          unit_weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_components: {
        Row: {
          component_id: string
          condition_note: string | null
          id: string
          included: boolean
          movement_id: string
        }
        Insert: {
          component_id: string
          condition_note?: string | null
          id?: string
          included?: boolean
          movement_id: string
        }
        Update: {
          component_id?: string
          condition_note?: string | null
          id?: string
          included?: boolean
          movement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movement_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "tool_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_components_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "tool_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          org_id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          org_id: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          org_id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          catalog_item_id: string | null
          delivered_quantity: number
          description: string
          id: string
          notes: string | null
          order_id: string
          quantity: number
          unit: string
          unit_price: number | null
        }
        Insert: {
          catalog_item_id?: string | null
          delivered_quantity?: number
          description: string
          id?: string
          notes?: string | null
          order_id: string
          quantity: number
          unit?: string
          unit_price?: number | null
        }
        Update: {
          catalog_item_id?: string | null
          delivered_quantity?: number
          description?: string
          id?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          unit?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "vendor_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approved_by: string | null
          bill_to: string
          bill_to_vendor_id: string | null
          confirmed_at: string | null
          created_at: string
          hot_premium: number | null
          id: string
          is_hot: boolean
          needed_by: string | null
          notes: string | null
          order_number: string
          org_id: string
          promised_delivery_date: string | null
          quote_id: string | null
          requested_by: string
          site_id: string
          status: string
          total_estimate: number | null
          vendor_id: string | null
        }
        Insert: {
          approved_by?: string | null
          bill_to?: string
          bill_to_vendor_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          hot_premium?: number | null
          id?: string
          is_hot?: boolean
          needed_by?: string | null
          notes?: string | null
          order_number: string
          org_id: string
          promised_delivery_date?: string | null
          quote_id?: string | null
          requested_by: string
          site_id: string
          status?: string
          total_estimate?: number | null
          vendor_id?: string | null
        }
        Update: {
          approved_by?: string | null
          bill_to?: string
          bill_to_vendor_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          hot_premium?: number | null
          id?: string
          is_hot?: boolean
          needed_by?: string | null
          notes?: string | null
          order_number?: string
          org_id?: string
          promised_delivery_date?: string | null
          quote_id?: string | null
          requested_by?: string
          site_id?: string
          status?: string
          total_estimate?: number | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_orders_quote"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_bill_to_vendor_id_fkey"
            columns: ["bill_to_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string
          org_id: string
          role: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by: string
          org_id: string
          role?: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          company_code: string | null
          created_at: string
          id: string
          logo_path: string | null
          name: string
          plan: string
          plan_valid_until: string | null
          settings: Json
          vat_code: string | null
        }
        Insert: {
          company_code?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          name: string
          plan?: string
          plan_valid_until?: string | null
          settings?: Json
          vat_code?: string | null
        }
        Update: {
          company_code?: string | null
          created_at?: string
          id?: string
          logo_path?: string | null
          name?: string
          plan?: string
          plan_valid_until?: string | null
          settings?: Json
          vat_code?: string | null
        }
        Relationships: []
      }
      outbound_messages: {
        Row: {
          body_storage_path: string | null
          channel: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          org_id: string
          provider_message_id: string | null
          sent_by: string | null
          sent_by_type: string
          status: string
          status_updated_at: string | null
          subject: string | null
          to_address: string
        }
        Insert: {
          body_storage_path?: string | null
          channel: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          org_id: string
          provider_message_id?: string | null
          sent_by?: string | null
          sent_by_type: string
          status?: string
          status_updated_at?: string | null
          subject?: string | null
          to_address: string
        }
        Update: {
          body_storage_path?: string | null
          channel?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          org_id?: string
          provider_message_id?: string | null
          sent_by?: string | null
          sent_by_type?: string
          status?: string
          status_updated_at?: string | null
          subject?: string | null
          to_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          ai_features: boolean
          max_sites: number | null
          max_tools: number | null
          max_users: number | null
          plan: string
          recharging: boolean
          reconciliation: boolean
          updated_at: string
        }
        Insert: {
          ai_features?: boolean
          max_sites?: number | null
          max_tools?: number | null
          max_users?: number | null
          plan: string
          recharging?: boolean
          reconciliation?: boolean
          updated_at?: string
        }
        Update: {
          ai_features?: boolean
          max_sites?: number | null
          max_tools?: number | null
          max_users?: number | null
          plan?: string
          recharging?: boolean
          reconciliation?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          locale: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
        }
        Relationships: []
      }
      quote_requests: {
        Row: {
          created_at: string
          created_by: string
          deadline: string | null
          id: string
          material_request_id: string | null
          org_id: string
          request_number: string
          site_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deadline?: string | null
          id?: string
          material_request_id?: string | null
          org_id: string
          request_number: string
          site_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deadline?: string | null
          id?: string
          material_request_id?: string | null
          org_id?: string
          request_number?: string
          site_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_material_request_id_fkey"
            columns: ["material_request_id"]
            isOneToOne: false
            referencedRelation: "material_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          delivery_days: number | null
          document_path: string | null
          id: string
          lines: Json | null
          notes: string | null
          quote_request_id: string
          received_at: string | null
          status: string
          total_amount: number | null
          valid_until: string | null
          vendor_id: string
        }
        Insert: {
          delivery_days?: number | null
          document_path?: string | null
          id?: string
          lines?: Json | null
          notes?: string | null
          quote_request_id: string
          received_at?: string | null
          status?: string
          total_amount?: number | null
          valid_until?: string | null
          vendor_id: string
        }
        Update: {
          delivery_days?: number | null
          document_path?: string | null
          id?: string
          lines?: Json | null
          notes?: string | null
          quote_request_id?: string
          received_at?: string | null
          status?: string
          total_amount?: number | null
          valid_until?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      recharge_invoice_lines: {
        Row: {
          billed_amount: number
          cost_amount: number
          description: string
          id: string
          invoice_id: string
          line_type: string
          markup_percent: number
          notes: string | null
          order_id: string | null
          qty: number | null
          tool_id: string | null
          unit: string | null
        }
        Insert: {
          billed_amount: number
          cost_amount: number
          description: string
          id?: string
          invoice_id: string
          line_type: string
          markup_percent?: number
          notes?: string | null
          order_id?: string | null
          qty?: number | null
          tool_id?: string | null
          unit?: string | null
        }
        Update: {
          billed_amount?: number
          cost_amount?: number
          description?: string
          id?: string
          invoice_id?: string
          line_type?: string
          markup_percent?: number
          notes?: string | null
          order_id?: string | null
          qty?: number | null
          tool_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recharge_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "recharge_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recharge_invoice_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recharge_invoice_lines_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      recharge_invoices: {
        Row: {
          accounting_ref: string | null
          counterparty_vendor_id: string
          created_at: string
          created_by: string
          export_path: string | null
          id: string
          invoice_number: string
          org_id: string
          period_end: string | null
          period_start: string | null
          status: string
          total_billed: number | null
          total_cost: number | null
        }
        Insert: {
          accounting_ref?: string | null
          counterparty_vendor_id: string
          created_at?: string
          created_by: string
          export_path?: string | null
          id?: string
          invoice_number: string
          org_id: string
          period_end?: string | null
          period_start?: string | null
          status?: string
          total_billed?: number | null
          total_cost?: number | null
        }
        Update: {
          accounting_ref?: string | null
          counterparty_vendor_id?: string
          created_at?: string
          created_by?: string
          export_path?: string | null
          id?: string
          invoice_number?: string
          org_id?: string
          period_end?: string | null
          period_start?: string | null
          status?: string
          total_billed?: number | null
          total_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recharge_invoices_counterparty_vendor_id_fkey"
            columns: ["counterparty_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recharge_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recharge_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_reservations: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          notes: string | null
          org_id: string
          reserved_by: string
          site_id: string | null
          starts_on: string
          status: string
          tool_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          notes?: string | null
          org_id: string
          reserved_by: string
          site_id?: string | null
          starts_on: string
          status?: string
          tool_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          notes?: string | null
          org_id?: string
          reserved_by?: string
          site_id?: string | null
          starts_on?: string
          status?: string
          tool_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_reservations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_reservations_reserved_by_fkey"
            columns: ["reserved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_reservations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_reservations_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_reservations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_assignments: {
        Row: {
          created_at: string
          id: string
          is_manager: boolean
          org_id: string
          site_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_manager?: boolean
          org_id: string
          site_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_manager?: boolean
          org_id?: string
          site_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_services: {
        Row: {
          contract_number: string | null
          created_at: string
          ends_on: string | null
          id: string
          monthly_cost_estimate: number | null
          notes: string | null
          org_id: string
          service_type: string
          site_id: string
          starts_on: string | null
          status: string
          vendor_id: string | null
        }
        Insert: {
          contract_number?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          monthly_cost_estimate?: number | null
          notes?: string | null
          org_id: string
          service_type: string
          site_id: string
          starts_on?: string | null
          status?: string
          vendor_id?: string | null
        }
        Update: {
          contract_number?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          monthly_cost_estimate?: number | null
          notes?: string | null
          org_id?: string
          service_type?: string
          site_id?: string
          starts_on?: string | null
          status?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_services_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_services_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_services_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          id: string
          location_id: string
          material_id: string
          min_quantity: number | null
          org_id: string
          quantity: number
          unit: string
        }
        Insert: {
          id?: string
          location_id: string
          material_id: string
          min_quantity?: number | null
          org_id: string
          quantity?: number
          unit?: string
        }
        Update: {
          id?: string
          location_id?: string
          material_id?: string
          min_quantity?: number | null
          org_id?: string
          quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          id: string
          issued_to: string | null
          movement_type: string
          notes: string | null
          order_item_id: string | null
          org_id: string
          performed_at: string
          performed_by: string
          quantity: number
          stock_item_id: string
        }
        Insert: {
          id?: string
          issued_to?: string | null
          movement_type: string
          notes?: string | null
          order_item_id?: string | null
          org_id: string
          performed_at?: string
          performed_by: string
          quantity: number
          stock_item_id: string
        }
        Update: {
          id?: string
          issued_to?: string | null
          movement_type?: string
          notes?: string | null
          order_item_id?: string | null
          org_id?: string
          performed_at?: string
          performed_by?: string
          quantity?: number
          stock_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_issued_to_fkey"
            columns: ["issued_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_categories: {
        Row: {
          id: string
          name: string
          org_id: string
        }
        Insert: {
          id?: string
          name: string
          org_id: string
        }
        Update: {
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_components: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          org_id: string
          quantity: number
          serial_number: string | null
          status: string
          tool_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          org_id: string
          quantity?: number
          serial_number?: string | null
          status?: string
          tool_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          quantity?: number
          serial_number?: string | null
          status?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_components_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_components_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_movements: {
        Row: {
          action: string
          engine_hours_reading: number | null
          external_holder_id: string | null
          from_location_id: string | null
          gps_latitude: number | null
          gps_longitude: number | null
          holder_id: string | null
          id: string
          notes: string | null
          org_id: string
          performed_at: string
          performed_by: string
          to_location_id: string | null
          tool_id: string
        }
        Insert: {
          action: string
          engine_hours_reading?: number | null
          external_holder_id?: string | null
          from_location_id?: string | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          holder_id?: string | null
          id?: string
          notes?: string | null
          org_id: string
          performed_at?: string
          performed_by: string
          to_location_id?: string | null
          tool_id: string
        }
        Update: {
          action?: string
          engine_hours_reading?: number | null
          external_holder_id?: string | null
          from_location_id?: string | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          holder_id?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          performed_at?: string
          performed_by?: string
          to_location_id?: string | null
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_movements_external_holder_id_fkey"
            columns: ["external_holder_id"]
            isOneToOne: false
            referencedRelation: "external_persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_movements_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_movements_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_movements_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_movements_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_movements_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_photos: {
        Row: {
          component_id: string | null
          id: string
          movement_id: string | null
          notes: string | null
          org_id: string
          photo_type: string
          repair_id: string | null
          storage_path: string
          taken_at: string
          taken_by: string | null
          tool_id: string
        }
        Insert: {
          component_id?: string | null
          id?: string
          movement_id?: string | null
          notes?: string | null
          org_id: string
          photo_type: string
          repair_id?: string | null
          storage_path: string
          taken_at?: string
          taken_by?: string | null
          tool_id: string
        }
        Update: {
          component_id?: string | null
          id?: string
          movement_id?: string | null
          notes?: string | null
          org_id?: string
          photo_type?: string
          repair_id?: string | null
          storage_path?: string
          taken_at?: string
          taken_by?: string | null
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_photos_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "tool_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_photos_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "tool_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_photos_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "tool_repairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_photos_taken_by_fkey"
            columns: ["taken_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_photos_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_repairs: {
        Row: {
          cost: number | null
          created_at: string
          created_by: string
          description: string
          id: string
          is_warranty_claim: boolean
          org_id: string
          repair_type: string
          resolution: string | null
          returned_at: string | null
          sent_at: string
          service_vendor_id: string | null
          status: string
          tool_id: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          created_by: string
          description: string
          id?: string
          is_warranty_claim?: boolean
          org_id: string
          repair_type?: string
          resolution?: string | null
          returned_at?: string | null
          sent_at?: string
          service_vendor_id?: string | null
          status?: string
          tool_id: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          is_warranty_claim?: boolean
          org_id?: string
          repair_type?: string
          resolution?: string | null
          returned_at?: string | null
          sent_at?: string
          service_vendor_id?: string | null
          status?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_repairs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_repairs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_repairs_service_vendor_id_fkey"
            columns: ["service_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_repairs_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          category_id: string | null
          created_at: string
          current_external_holder_id: string | null
          current_holder_id: string | null
          current_location_id: string | null
          engine_hours: number | null
          id: string
          internal_rate_daily: number | null
          inventory_code: string | null
          name: string
          notes: string | null
          org_id: string
          ownership: string
          purchase_date: string | null
          purchase_invoice_number: string | null
          purchase_price: number | null
          purchased_from_vendor_id: string | null
          qr_code: string | null
          rental_due_return: string | null
          rental_rate_daily: number | null
          rental_start: string | null
          rental_vendor_id: string | null
          rented_for_vendor_id: string | null
          serial_number: string | null
          status: string
          tracks_engine_hours: boolean
          warranty_months: number | null
          warranty_until: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          current_external_holder_id?: string | null
          current_holder_id?: string | null
          current_location_id?: string | null
          engine_hours?: number | null
          id?: string
          internal_rate_daily?: number | null
          inventory_code?: string | null
          name: string
          notes?: string | null
          org_id: string
          ownership?: string
          purchase_date?: string | null
          purchase_invoice_number?: string | null
          purchase_price?: number | null
          purchased_from_vendor_id?: string | null
          qr_code?: string | null
          rental_due_return?: string | null
          rental_rate_daily?: number | null
          rental_start?: string | null
          rental_vendor_id?: string | null
          rented_for_vendor_id?: string | null
          serial_number?: string | null
          status?: string
          tracks_engine_hours?: boolean
          warranty_months?: number | null
          warranty_until?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          current_external_holder_id?: string | null
          current_holder_id?: string | null
          current_location_id?: string | null
          engine_hours?: number | null
          id?: string
          internal_rate_daily?: number | null
          inventory_code?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          ownership?: string
          purchase_date?: string | null
          purchase_invoice_number?: string | null
          purchase_price?: number | null
          purchased_from_vendor_id?: string | null
          qr_code?: string | null
          rental_due_return?: string | null
          rental_rate_daily?: number | null
          rental_start?: string | null
          rental_vendor_id?: string | null
          rented_for_vendor_id?: string | null
          serial_number?: string | null
          status?: string
          tracks_engine_hours?: boolean
          warranty_months?: number | null
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_tools_purchased_from"
            columns: ["purchased_from_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tools_rental_vendor"
            columns: ["rental_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tools_rented_for"
            columns: ["rented_for_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tools_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tool_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tools_current_external_holder_id_fkey"
            columns: ["current_external_holder_id"]
            isOneToOne: false
            referencedRelation: "external_persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tools_current_holder_id_fkey"
            columns: ["current_holder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tools_current_location_id_fkey"
            columns: ["current_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tools_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_trips: {
        Row: {
          driver_id: string
          ended_at: string | null
          id: string
          km_total: number | null
          notes: string | null
          odometer_end: number | null
          odometer_start: number | null
          org_id: string
          started_at: string
          vehicle_id: string
        }
        Insert: {
          driver_id: string
          ended_at?: string | null
          id?: string
          km_total?: number | null
          notes?: string | null
          odometer_end?: number | null
          odometer_start?: number | null
          org_id: string
          started_at?: string
          vehicle_id: string
        }
        Update: {
          driver_id?: string
          ended_at?: string | null
          id?: string
          km_total?: number | null
          notes?: string | null
          odometer_end?: number | null
          odometer_start?: number | null
          org_id?: string
          started_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_trips_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          can_carry_pallets: boolean
          capacity_kg: number | null
          capacity_m3: number | null
          created_at: string
          has_crane: boolean
          id: string
          max_item_length_m: number | null
          name: string
          org_id: string
          plate_number: string | null
          status: string
          type: string
        }
        Insert: {
          can_carry_pallets?: boolean
          capacity_kg?: number | null
          capacity_m3?: number | null
          created_at?: string
          has_crane?: boolean
          id?: string
          max_item_length_m?: number | null
          name: string
          org_id: string
          plate_number?: string | null
          status?: string
          type?: string
        }
        Update: {
          can_carry_pallets?: boolean
          capacity_kg?: number | null
          capacity_m3?: number | null
          created_at?: string
          has_crane?: boolean
          id?: string
          max_item_length_m?: number | null
          name?: string
          org_id?: string
          plate_number?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_catalog_items: {
        Row: {
          id: string
          is_available: boolean
          lead_time_days: number | null
          material_id: string | null
          name: string
          org_id: string
          price: number | null
          sku: string
          source: string
          synced_at: string | null
          unit: string
          vendor_id: string
        }
        Insert: {
          id?: string
          is_available?: boolean
          lead_time_days?: number | null
          material_id?: string | null
          name: string
          org_id: string
          price?: number | null
          sku: string
          source?: string
          synced_at?: string | null
          unit?: string
          vendor_id: string
        }
        Update: {
          id?: string
          is_available?: boolean
          lead_time_days?: number | null
          material_id?: string | null
          name?: string
          org_id?: string
          price?: number | null
          sku?: string
          source?: string
          synced_at?: string | null
          unit?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_catalog_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_catalog_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_invoice_lines: {
        Row: {
          billed_amount: number
          billed_period_end: string | null
          billed_period_start: string | null
          billed_qty: number | null
          billed_rate: number | null
          cost_category: string | null
          description: string
          id: string
          invoice_id: string
          line_status: string
          notes: string | null
          order_id: string | null
          site_id: string | null
          site_service_id: string | null
          system_expected_amount: number | null
          system_period_end: string | null
          system_period_start: string | null
          tool_id: string | null
          variance_amount: number | null
        }
        Insert: {
          billed_amount: number
          billed_period_end?: string | null
          billed_period_start?: string | null
          billed_qty?: number | null
          billed_rate?: number | null
          cost_category?: string | null
          description: string
          id?: string
          invoice_id: string
          line_status?: string
          notes?: string | null
          order_id?: string | null
          site_id?: string | null
          site_service_id?: string | null
          system_expected_amount?: number | null
          system_period_end?: string | null
          system_period_start?: string | null
          tool_id?: string | null
          variance_amount?: number | null
        }
        Update: {
          billed_amount?: number
          billed_period_end?: string | null
          billed_period_start?: string | null
          billed_qty?: number | null
          billed_rate?: number | null
          cost_category?: string | null
          description?: string
          id?: string
          invoice_id?: string
          line_status?: string
          notes?: string | null
          order_id?: string | null
          site_id?: string | null
          site_service_id?: string | null
          system_expected_amount?: number | null
          system_period_end?: string | null
          system_period_start?: string | null
          tool_id?: string | null
          variance_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vendor_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoice_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoice_lines_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoice_lines_site_service_id_fkey"
            columns: ["site_service_id"]
            isOneToOne: false
            referencedRelation: "site_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoice_lines_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_invoices: {
        Row: {
          created_at: string
          file_storage_path: string | null
          id: string
          invoice_date: string
          invoice_number: string
          invoice_type: string
          org_id: string
          reconciliation_status: string
          total_amount: number
          vendor_id: string
        }
        Insert: {
          created_at?: string
          file_storage_path?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          invoice_type?: string
          org_id: string
          reconciliation_status?: string
          total_amount: number
          vendor_id: string
        }
        Update: {
          created_at?: string
          file_storage_path?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          invoice_type?: string
          org_id?: string
          reconciliation_status?: string
          total_amount?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          created_at: string
          default_lead_time_days: number | null
          email: string | null
          id: string
          integration_config: Json | null
          name: string
          notes: string | null
          order_method: string
          org_id: string
          phone: string | null
          type: string[]
        }
        Insert: {
          created_at?: string
          default_lead_time_days?: number | null
          email?: string | null
          id?: string
          integration_config?: Json | null
          name: string
          notes?: string | null
          order_method?: string
          org_id: string
          phone?: string | null
          type?: string[]
        }
        Update: {
          created_at?: string
          default_lead_time_days?: number | null
          email?: string | null
          id?: string
          integration_config?: Json | null
          name?: string
          notes?: string | null
          order_method?: string
          org_id?: string
          phone?: string | null
          type?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "vendors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_containers: {
        Row: {
          container_type: string | null
          cost: number | null
          delivered_at: string | null
          id: string
          notes: string | null
          ordered_at: string | null
          org_id: string
          removed_at: string | null
          site_id: string
          status: string
          vendor_id: string | null
          waste_type: string
        }
        Insert: {
          container_type?: string | null
          cost?: number | null
          delivered_at?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          org_id: string
          removed_at?: string | null
          site_id: string
          status?: string
          vendor_id?: string | null
          waste_type?: string
        }
        Update: {
          container_type?: string | null
          cost?: number | null
          delivered_at?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          org_id?: string
          removed_at?: string | null
          site_id?: string
          status?: string
          vendor_id?: string | null
          waste_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_containers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_containers_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_containers_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_records: {
        Row: {
          carrier_vendor_id: string | null
          container_id: string | null
          created_at: string
          description: string | null
          document_path: string | null
          gpais_status: string
          id: string
          manifest_number: string | null
          notes: string | null
          org_id: string
          receiver_name: string | null
          removed_at: string
          site_id: string
          waste_code: string
          weight_kg: number | null
        }
        Insert: {
          carrier_vendor_id?: string | null
          container_id?: string | null
          created_at?: string
          description?: string | null
          document_path?: string | null
          gpais_status?: string
          id?: string
          manifest_number?: string | null
          notes?: string | null
          org_id: string
          receiver_name?: string | null
          removed_at: string
          site_id: string
          waste_code: string
          weight_kg?: number | null
        }
        Update: {
          carrier_vendor_id?: string | null
          container_id?: string | null
          created_at?: string
          description?: string | null
          document_path?: string | null
          gpais_status?: string
          id?: string
          manifest_number?: string | null
          notes?: string | null
          org_id?: string
          receiver_name?: string | null
          removed_at?: string
          site_id?: string
          waste_code?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "waste_records_carrier_vendor_id_fkey"
            columns: ["carrier_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_records_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "waste_containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_records_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_inspection_schedule: {
        Args: {
          due: string
          itype: string
          months: number
          target_tool: string
        }
        Returns: string
      }
      add_tool_component: {
        Args: {
          component_name: string
          component_qty?: number
          serial?: string
          target_tool: string
        }
        Returns: string
      }
      add_tool_photo: {
        Args: { path: string; target_tool: string }
        Returns: undefined
      }
      assert_location_editor: {
        Args: { target_org: string }
        Returns: undefined
      }
      assert_tool_editor: { Args: { target_org: string }; Returns: undefined }
      assign_site_member: {
        Args: { manager?: boolean; target_site: string; target_user: string }
        Returns: undefined
      }
      close_inventory_session: {
        Args: { mark_missing_lost?: boolean; target_session: string }
        Returns: Json
      }
      countersign_handover: {
        Args: { act_id: string; note?: string; signature_path: string }
        Returns: Json
      }
      create_external_person: {
        Args: {
          person_name: string
          person_phone?: string
          person_position?: string
          target_org: string
        }
        Returns: string
      }
      create_location: {
        Args: { payload: Json; target_org: string }
        Returns: string
      }
      create_organization: { Args: { org_name: string }; Returns: string }
      create_tool: {
        Args: { payload: Json; target_org: string }
        Returns: string
      }
      import_tools: { Args: { rows: Json; target_org: string }; Returns: Json }
      initiate_handover: { Args: { args: Json }; Returns: Json }
      invite_member: {
        Args: { invite_email: string; invite_role: string; target_org: string }
        Returns: string
      }
      is_assigned_to_site: { Args: { check_site: string }; Returns: boolean }
      is_org_member: { Args: { check_org: string }; Returns: boolean }
      next_act_number: { Args: { target_org: string }; Returns: string }
      next_tool_qr: { Args: { target_org: string }; Returns: string }
      notify_missing_components: {
        Args: { movement: string; target_org: string; target_tool: string }
        Returns: undefined
      }
      perform_handover: { Args: { args: Json }; Returns: Json }
      record_inventory_scan: {
        Args: { target_session: string; target_tool: string }
        Returns: Json
      }
      remind: {
        Args: {
          e_id: string
          e_type: string
          kind: string
          r_body: string
          r_title: string
          target_org: string
          target_user: string
        }
        Returns: undefined
      }
      remove_site_assignment: {
        Args: { target_site: string; target_user: string }
        Returns: undefined
      }
      remove_tool_component: {
        Args: { component_id: string }
        Returns: undefined
      }
      rental_intake: { Args: { args: Json }; Returns: Json }
      return_to_vendor: { Args: { args: Json }; Returns: Json }
      run_daily_reminders: { Args: never; Returns: Json }
      set_act_pdf_path: {
        Args: { act_id: string; pdf_path: string }
        Returns: undefined
      }
      shares_org_with: { Args: { other: string }; Returns: boolean }
      start_inventory_session: {
        Args: { target_location: string }
        Returns: string
      }
      update_location: {
        Args: { location_id: string; payload: Json }
        Returns: undefined
      }
      update_tool: {
        Args: { payload: Json; tool_id: string }
        Returns: undefined
      }
      write_off_tool: {
        Args: {
          note?: string
          photo_paths?: Json
          reason: string
          target_tool: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

