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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      api_payments: {
        Row: {
          amount_usd: number
          app_id: string
          cancel_url: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_reference: string | null
          description: string | null
          id: string
          metadata: Json | null
          net_usd: number
          owner_id: string
          paid_at: string | null
          paypal_capture_id: string | null
          paypal_order_id: string | null
          platform_fee_pct: number
          platform_fee_usd: number
          raw_paypal: Json | null
          return_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_usd: number
          app_id: string
          cancel_url?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_reference?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          net_usd: number
          owner_id: string
          paid_at?: string | null
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          platform_fee_pct: number
          platform_fee_usd: number
          raw_paypal?: Json | null
          return_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_usd?: number
          app_id?: string
          cancel_url?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_reference?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          net_usd?: number
          owner_id?: string
          paid_at?: string | null
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          platform_fee_pct?: number
          platform_fee_usd?: number
          raw_paypal?: Json | null
          return_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_payments_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "developer_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          app_id: string | null
          created_at: string
          error: string | null
          id: string
          ip: string | null
          latency_ms: number | null
          method: string
          path: string
          status_code: number
          user_agent: string | null
        }
        Insert: {
          app_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          ip?: string | null
          latency_ms?: number | null
          method: string
          path: string
          status_code: number
          user_agent?: string | null
        }
        Update: {
          app_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          ip?: string | null
          latency_ms?: number | null
          method?: string
          path?: string
          status_code?: number
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "developer_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_clears: {
        Row: {
          cleared_at: string
          peer_id: string
          user_id: string
        }
        Insert: {
          cleared_at?: string
          peer_id: string
          user_id: string
        }
        Update: {
          cleared_at?: string
          peer_id?: string
          user_id?: string
        }
        Relationships: []
      }
      collection_items: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          name: string
          share_token: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          name: string
          share_token?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          share_token?: string | null
          user_id?: string
        }
        Relationships: []
      }
      developer_apps: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          owner_id: string
          platform_fee_pct: number
          rate_limit_per_min: number
          scopes: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          owner_id: string
          platform_fee_pct?: number
          rate_limit_per_min?: number
          scopes?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          owner_id?: string
          platform_fee_pct?: number
          rate_limit_per_min?: number
          scopes?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      device_fingerprints: {
        Row: {
          fingerprint: string
          first_seen: string
          id: string
          ip: string | null
          last_seen: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          fingerprint: string
          first_seen?: string
          id?: string
          ip?: string | null
          last_seen?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          fingerprint?: string
          first_seen?: string
          id?: string
          ip?: string | null
          last_seen?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_submissions: {
        Row: {
          created_at: string
          document_type: string
          id: string
          id_back_path: string | null
          id_front_path: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_path: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_type?: string
          id?: string
          id_back_path?: string | null
          id_front_path: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_type?: string
          id?: string
          id_back_path?: string | null
          id_front_path?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          delivered_at: string | null
          id: string
          kind: string
          latitude: number | null
          longitude: number | null
          product_id: string | null
          read: boolean
          recipient_id: string
          seen_at: string | null
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          kind?: string
          latitude?: number | null
          longitude?: number | null
          product_id?: string | null
          read?: boolean
          recipient_id: string
          seen_at?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          kind?: string
          latitude?: number | null
          longitude?: number | null
          product_id?: string | null
          read?: boolean
          recipient_id?: string
          seen_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_appeals: {
        Row: {
          admin_response: string | null
          created_at: string
          flag_id: string | null
          full_name: string | null
          id: string
          is_critical: boolean
          message: string
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_path: string | null
          status: string
          terms_accepted: boolean
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          flag_id?: string | null
          full_name?: string | null
          id?: string
          is_critical?: boolean
          message: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string | null
          status?: string
          terms_accepted?: boolean
          user_id: string
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          flag_id?: string | null
          full_name?: string | null
          id?: string
          is_critical?: boolean
          message?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_path?: string | null
          status?: string
          terms_accepted?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_appeals_flag_id_fkey"
            columns: ["flag_id"]
            isOneToOne: false
            referencedRelation: "moderation_flags"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_events: {
        Row: {
          content: string | null
          created_at: string
          event_type: string
          id: string
          ip: string | null
          metadata: Json
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      moderation_flags: {
        Row: {
          acknowledged: boolean
          ai_verdict: Json | null
          category: string
          created_at: string
          id: string
          reason: string
          severity: string
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          ai_verdict?: Json | null
          category: string
          created_at?: string
          id?: string
          reason: string
          severity?: string
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          ai_verdict?: Json | null
          category?: string
          created_at?: string
          id?: string
          reason?: string
          severity?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          category: Database["public"]["Enums"]["notification_category"]
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: Database["public"]["Enums"]["notification_category"]
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          buyer_email: string | null
          buyer_id: string
          buyer_name: string | null
          created_at: string
          failed_at: string | null
          fx_rate: number | null
          id: string
          notes: string | null
          original_currency: string
          original_price: number
          paid_at: string | null
          paypal_capture_id: string | null
          paypal_order_id: string | null
          platform_fee_usd: number
          product_id: string
          product_title: string
          raw_paypal: Json | null
          released_at: string | null
          seller_id: string
          seller_net_usd: number
          shipping_address: Json | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          usd_amount: number
        }
        Insert: {
          buyer_email?: string | null
          buyer_id: string
          buyer_name?: string | null
          created_at?: string
          failed_at?: string | null
          fx_rate?: number | null
          id?: string
          notes?: string | null
          original_currency?: string
          original_price: number
          paid_at?: string | null
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          platform_fee_usd?: number
          product_id: string
          product_title: string
          raw_paypal?: Json | null
          released_at?: string | null
          seller_id: string
          seller_net_usd?: number
          shipping_address?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          usd_amount: number
        }
        Update: {
          buyer_email?: string | null
          buyer_id?: string
          buyer_name?: string | null
          created_at?: string
          failed_at?: string | null
          fx_rate?: number | null
          id?: string
          notes?: string | null
          original_currency?: string
          original_price?: number
          paid_at?: string | null
          paypal_capture_id?: string | null
          paypal_order_id?: string | null
          platform_fee_usd?: number
          product_id?: string
          product_title?: string
          raw_paypal?: Json | null
          released_at?: string | null
          seller_id?: string
          seller_net_usd?: number
          shipping_address?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          usd_amount?: number
        }
        Relationships: []
      }
      payment_orders: {
        Row: {
          amount: number
          confirmation_code: string | null
          created_at: string
          currency: string
          description: string
          id: string
          merchant_reference: string
          metadata: Json
          payment_method: string | null
          paystack_reference: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          raw_status_response: Json | null
          redirect_url: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          confirmation_code?: string | null
          created_at?: string
          currency?: string
          description: string
          id?: string
          merchant_reference: string
          metadata?: Json
          payment_method?: string | null
          paystack_reference?: string | null
          purpose?: Database["public"]["Enums"]["payment_purpose"]
          raw_status_response?: Json | null
          redirect_url?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          confirmation_code?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          merchant_reference?: string
          metadata?: Json
          payment_method?: string | null
          paystack_reference?: string | null
          purpose?: Database["public"]["Enums"]["payment_purpose"]
          raw_status_response?: Json | null
          redirect_url?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_poll_jobs: {
        Row: {
          attempts: number
          created_at: string
          done: boolean
          id: string
          last_error: string | null
          next_run_at: string
          order_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          done?: boolean
          id?: string
          last_error?: string | null
          next_run_at?: string
          order_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          done?: boolean
          id?: string
          last_error?: string | null
          next_run_at?: string
          order_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_poll_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_views: {
        Row: {
          created_at: string
          id: string
          product_id: string
          viewer_id: string | null
          viewer_ip: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          viewer_id?: string | null
          viewer_ip?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          viewer_id?: string | null
          viewer_ip?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          boost_expires_at: string | null
          boost_tier: string | null
          boosted: boolean
          category: string
          condition: Database["public"]["Enums"]["product_condition"]
          created_at: string
          currency: string
          deleted_at: string | null
          description: string | null
          id: string
          location: string | null
          photos: string[]
          price: number
          seller_id: string
          shipping_available: boolean
          status: Database["public"]["Enums"]["product_status"]
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          boost_expires_at?: string | null
          boost_tier?: string | null
          boosted?: boolean
          category: string
          condition?: Database["public"]["Enums"]["product_condition"]
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          location?: string | null
          photos?: string[]
          price: number
          seller_id: string
          shipping_available?: boolean
          status?: Database["public"]["Enums"]["product_status"]
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          boost_expires_at?: string | null
          boost_tier?: string | null
          boosted?: boolean
          category?: string
          condition?: Database["public"]["Enums"]["product_condition"]
          created_at?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          location?: string | null
          photos?: string[]
          price?: number
          seller_id?: string
          shipping_available?: boolean
          status?: Database["public"]["Enums"]["product_status"]
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          avg_response_minutes: number
          ban_reason: string | null
          banner_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          display_name: string | null
          id: string
          location: string | null
          permanent_ban: boolean
          response_rate: number
          shop_description: string | null
          suspended_until: string | null
          updated_at: string
          user_id: string
          verified: boolean
          verified_at: string | null
          verified_tier: string | null
          warning_count: number
          warning_level: string
        }
        Insert: {
          avatar_url?: string | null
          avg_response_minutes?: number
          ban_reason?: string | null
          banner_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          location?: string | null
          permanent_ban?: boolean
          response_rate?: number
          shop_description?: string | null
          suspended_until?: string | null
          updated_at?: string
          user_id: string
          verified?: boolean
          verified_at?: string | null
          verified_tier?: string | null
          warning_count?: number
          warning_level?: string
        }
        Update: {
          avatar_url?: string | null
          avg_response_minutes?: number
          ban_reason?: string | null
          banner_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          location?: string | null
          permanent_ban?: boolean
          response_rate?: number
          shop_description?: string | null
          suspended_until?: string | null
          updated_at?: string
          user_id?: string
          verified?: boolean
          verified_at?: string | null
          verified_tier?: string | null
          warning_count?: number
          warning_level?: string
        }
        Relationships: []
      }
      recent_searches: {
        Row: {
          created_at: string
          id: string
          query: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          query: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          query?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          resolved: boolean
          severity: number
          target_product_id: string | null
          target_user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          resolved?: boolean
          severity?: number
          target_product_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string
          resolved?: boolean
          severity?: number
          target_product_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_target_product_id_fkey"
            columns: ["target_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          reviewer_id: string
          seller_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          reviewer_id: string
          seller_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          reviewer_id?: string
          seller_id?: string
        }
        Relationships: []
      }
      seller_paypal_accounts: {
        Row: {
          connected_at: string
          id: string
          payer_email: string
          payer_id: string | null
          refresh_token_encrypted: string | null
          scopes: string | null
          seller_id: string
          updated_at: string
          verified_account: boolean
        }
        Insert: {
          connected_at?: string
          id?: string
          payer_email: string
          payer_id?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string | null
          seller_id: string
          updated_at?: string
          verified_account?: boolean
        }
        Update: {
          connected_at?: string
          id?: string
          payer_email?: string
          payer_id?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string | null
          seller_id?: string
          updated_at?: string
          verified_account?: boolean
        }
        Relationships: []
      }
      seller_wallets: {
        Row: {
          available_usd: number
          created_at: string
          id: string
          lifetime_earned_usd: number
          lifetime_withdrawn_usd: number
          pending_usd: number
          seller_id: string
          updated_at: string
        }
        Insert: {
          available_usd?: number
          created_at?: string
          id?: string
          lifetime_earned_usd?: number
          lifetime_withdrawn_usd?: number
          pending_usd?: number
          seller_id: string
          updated_at?: string
        }
        Update: {
          available_usd?: number
          created_at?: string
          id?: string
          lifetime_earned_usd?: number
          lifetime_withdrawn_usd?: number
          pending_usd?: number
          seller_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      signup_attempts: {
        Row: {
          created_at: string
          email: string | null
          fingerprint: string | null
          id: string
          ip: string | null
          reason: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          fingerprint?: string | null
          id?: string
          ip?: string | null
          reason?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          fingerprint?: string | null
          id?: string
          ip?: string | null
          reason?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_response: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
          subject: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      typing_status: {
        Row: {
          is_typing: boolean
          peer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          is_typing?: boolean
          peer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          is_typing?: boolean
          peer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          allow_messages: boolean
          created_at: string
          language: string
          read_receipts: boolean
          region: string
          show_location: boolean
          show_online: boolean
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_messages?: boolean
          created_at?: string
          language?: string
          read_receipts?: boolean
          region?: string
          show_location?: boolean
          show_online?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_messages?: boolean
          created_at?: string
          language?: string
          read_receipts?: boolean
          region?: string
          show_location?: boolean
          show_online?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount_usd: number
          balance_after_usd: number | null
          created_at: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["wallet_txn_kind"]
          metadata: Json
          order_id: string | null
          seller_id: string
          withdrawal_id: string | null
        }
        Insert: {
          amount_usd: number
          balance_after_usd?: number | null
          created_at?: string
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["wallet_txn_kind"]
          metadata?: Json
          order_id?: string | null
          seller_id: string
          withdrawal_id?: string | null
        }
        Update: {
          amount_usd?: number
          balance_after_usd?: number | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["wallet_txn_kind"]
          metadata?: Json
          order_id?: string | null
          seller_id?: string
          withdrawal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          event_type: string
          id: string
          last_error: string | null
          last_status_code: number | null
          next_attempt_at: string
          payload: Json
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          event_type: string
          id?: string
          last_error?: string | null
          last_status_code?: number | null
          next_attempt_at?: string
          payload: Json
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          event_type?: string
          id?: string
          last_error?: string | null
          last_status_code?: number | null
          next_attempt_at?: string
          payload?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          active: boolean
          app_id: string
          created_at: string
          events: string[]
          id: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          app_id: string
          created_at?: string
          events?: string[]
          id?: string
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          app_id?: string
          created_at?: string
          events?: string[]
          id?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "developer_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          amount_usd: number
          created_at: string
          failure_reason: string | null
          id: string
          paid_at: string | null
          paypal_batch_id: string | null
          paypal_item_id: string | null
          raw_paypal: Json | null
          recipient_email: string
          seller_id: string
          status: Database["public"]["Enums"]["withdrawal_status"]
          updated_at: string
        }
        Insert: {
          amount_usd: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          paypal_batch_id?: string | null
          paypal_item_id?: string | null
          raw_paypal?: Json | null
          recipient_email: string
          seller_id: string
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
        }
        Update: {
          amount_usd?: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          paypal_batch_id?: string | null
          paypal_item_id?: string | null
          raw_paypal?: Json | null
          recipient_email?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      enqueue_webhook_event: {
        Args: { _event_type: string; _payload: Json }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      record_product_view: {
        Args: { _product_id: string; _viewer_ip: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      kyc_status: "pending" | "approved" | "rejected"
      notification_category: "messages" | "product" | "account" | "promotions"
      order_status:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "cancelled"
        | "released"
      payment_purpose:
        | "boost_product"
        | "verification"
        | "subscription"
        | "other"
      payment_status:
        | "pending"
        | "completed"
        | "failed"
        | "cancelled"
        | "reversed"
      product_condition: "new" | "like_new" | "used" | "refurbished"
      product_status:
        | "active"
        | "archived"
        | "sold"
        | "deleted"
        | "pending_review"
      report_reason:
        | "misleading"
        | "counterfeit"
        | "scam"
        | "inappropriate"
        | "other"
      wallet_txn_kind: "sale" | "withdrawal" | "fee" | "refund" | "adjustment"
      withdrawal_status:
        | "pending"
        | "processing"
        | "paid"
        | "failed"
        | "cancelled"
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
      app_role: ["admin", "moderator", "user"],
      kyc_status: ["pending", "approved", "rejected"],
      notification_category: ["messages", "product", "account", "promotions"],
      order_status: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "cancelled",
        "released",
      ],
      payment_purpose: [
        "boost_product",
        "verification",
        "subscription",
        "other",
      ],
      payment_status: [
        "pending",
        "completed",
        "failed",
        "cancelled",
        "reversed",
      ],
      product_condition: ["new", "like_new", "used", "refurbished"],
      product_status: [
        "active",
        "archived",
        "sold",
        "deleted",
        "pending_review",
      ],
      report_reason: [
        "misleading",
        "counterfeit",
        "scam",
        "inappropriate",
        "other",
      ],
      wallet_txn_kind: ["sale", "withdrawal", "fee", "refund", "adjustment"],
      withdrawal_status: [
        "pending",
        "processing",
        "paid",
        "failed",
        "cancelled",
      ],
    },
  },
} as const
