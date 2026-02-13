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
      bot_profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string | null
          id: string
          mmr: number | null
          nickname: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string | null
          id: string
          mmr?: number | null
          nickname: string
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          mmr?: number | null
          nickname?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string | null
          friend_id: string
          id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          friend_id: string
          id?: string
          status: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          friend_id?: string
          id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      game_moves: {
        Row: {
          created_at: string | null
          id: string
          move: string
          player_id: string
          room_id: string | null
          round: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          move: string
          player_id: string
          room_id?: string | null
          round: number
        }
        Update: {
          created_at?: string | null
          id?: string
          move?: string
          player_id?: string
          room_id?: string | null
          round?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_moves_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          created_at: string | null
          current_round: number | null
          current_round_index: number | null
          end_at: string | null
          game_data: Json | null
          game_type: string | null
          game_types: string[] | null
          id: string
          mode: string | null
          p1_current_score: number | null
          p2_current_score: number | null
          phase_end_at: string | null
          phase_start_at: string | null
          player1_id: string
          player1_ready: boolean | null
          player1_score: number | null
          player2_id: string
          player2_ready: boolean | null
          player2_score: number | null
          round_scores: Json | null
          seed: string | null
          start_at: string | null
          status: string | null
          target_move: string | null
          winner_id: string | null
        }
        Insert: {
          created_at?: string | null
          current_round?: number | null
          current_round_index?: number | null
          end_at?: string | null
          game_data?: Json | null
          game_type?: string | null
          game_types?: string[] | null
          id?: string
          mode?: string | null
          p1_current_score?: number | null
          p2_current_score?: number | null
          phase_end_at?: string | null
          phase_start_at?: string | null
          player1_id: string
          player1_ready?: boolean | null
          player1_score?: number | null
          player2_id: string
          player2_ready?: boolean | null
          player2_score?: number | null
          round_scores?: Json | null
          seed?: string | null
          start_at?: string | null
          status?: string | null
          target_move?: string | null
          winner_id?: string | null
        }
        Update: {
          created_at?: string | null
          current_round?: number | null
          current_round_index?: number | null
          end_at?: string | null
          game_data?: Json | null
          game_type?: string | null
          game_types?: string[] | null
          id?: string
          mode?: string | null
          p1_current_score?: number | null
          p2_current_score?: number | null
          phase_end_at?: string | null
          phase_start_at?: string | null
          player1_id?: string
          player1_ready?: boolean | null
          player1_score?: number | null
          player2_id?: string
          player2_ready?: boolean | null
          player2_score?: number | null
          round_scores?: Json | null
          seed?: string | null
          start_at?: string | null
          status?: string | null
          target_move?: string | null
          winner_id?: string | null
        }
        Relationships: []
      }
      matchmaking_queue: {
        Row: {
          created_at: string | null
          mmr: number | null
          mode: string | null
          player_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          mmr?: number | null
          mode?: string | null
          player_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          mmr?: number | null
          mode?: string | null
          player_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      player_game_stats: {
        Row: {
          created_at: string | null
          game_type: string
          normal_draws: number
          normal_losses: number
          normal_wins: number
          rank_draws: number
          rank_losses: number
          rank_wins: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          game_type: string
          normal_draws?: number
          normal_losses?: number
          normal_wins?: number
          rank_draws?: number
          rank_losses?: number
          rank_wins?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          game_type?: string
          normal_draws?: number
          normal_losses?: number
          normal_wins?: number
          rank_draws?: number
          rank_losses?: number
          rank_wins?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_game_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_highscores: {
        Row: {
          best_score: number
          created_at: string | null
          game_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          best_score?: number
          created_at?: string | null
          game_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          best_score?: number
          created_at?: string | null
          game_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_highscores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accuracy: number | null
          ad_reward_count: number | null
          ad_reward_day: string | null
          ads_removed: boolean | null
          avatar_url: string | null
          calculation: number | null
          casual_losses: number | null
          casual_wins: number | null
          country: string | null
          created_at: string | null
          disconnects: number | null
          email: string | null
          full_name: string | null
          id: string
          judgment: number | null
          last_recharge_at: string | null
          last_seen: string | null
          level: number
          losses: number | null
          memory: number | null
          mmr: number | null
          nickname: string | null
          observation: number | null
          pencils: number | null
          practice_ad_reward_count: number | null
          practice_ad_reward_day: string | null
          practice_last_recharge_at: string | null
          practice_notes: number | null
          speed: number | null
          wins: number | null
          xp: number
        }
        Insert: {
          accuracy?: number | null
          ad_reward_count?: number | null
          ad_reward_day?: string | null
          ads_removed?: boolean | null
          avatar_url?: string | null
          calculation?: number | null
          casual_losses?: number | null
          casual_wins?: number | null
          country?: string | null
          created_at?: string | null
          disconnects?: number | null
          email?: string | null
          full_name?: string | null
          id: string
          judgment?: number | null
          last_recharge_at?: string | null
          last_seen?: string | null
          level?: number
          losses?: number | null
          memory?: number | null
          mmr?: number | null
          nickname?: string | null
          observation?: number | null
          pencils?: number | null
          practice_ad_reward_count?: number | null
          practice_ad_reward_day?: string | null
          practice_last_recharge_at?: string | null
          practice_notes?: number | null
          speed?: number | null
          wins?: number | null
          xp?: number
        }
        Update: {
          accuracy?: number | null
          ad_reward_count?: number | null
          ad_reward_day?: string | null
          ads_removed?: boolean | null
          avatar_url?: string | null
          calculation?: number | null
          casual_losses?: number | null
          casual_wins?: number | null
          country?: string | null
          created_at?: string | null
          disconnects?: number | null
          email?: string | null
          full_name?: string | null
          id?: string
          judgment?: number | null
          last_recharge_at?: string | null
          last_seen?: string | null
          level?: number
          losses?: number | null
          memory?: number | null
          mmr?: number | null
          nickname?: string | null
          observation?: number | null
          pencils?: number | null
          practice_ad_reward_count?: number | null
          practice_ad_reward_day?: string | null
          practice_last_recharge_at?: string | null
          practice_notes?: number | null
          speed?: number | null
          wins?: number | null
          xp?: number
        }
        Relationships: []
      }
      purchase_transactions: {
        Row: {
          created_at: string
          id: string
          original_transaction_id: string | null
          platform: string
          product_id: string
          store_environment: string | null
          store_payload: Json | null
          transaction_id: string
          user_id: string
          verified: boolean | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          original_transaction_id?: string | null
          platform: string
          product_id: string
          store_environment?: string | null
          store_payload?: Json | null
          transaction_id: string
          user_id: string
          verified?: boolean | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          original_transaction_id?: string | null
          platform?: string
          product_id?: string
          store_environment?: string | null
          store_payload?: Json | null
          transaction_id?: string
          user_id?: string
          verified?: boolean | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_friendly_session: {
        Args: { p_room_id: string }
        Returns: undefined
      }
      check_active_session: {
        Args: { p_player_id: string }
        Returns: {
          created_at: string
          opponent_id: string
          room_id: string
          status: string
        }[]
      }
      cleanup_stale_game_sessions: { Args: never; Returns: undefined }
      consume_pencil: { Args: { user_id: string }; Returns: boolean }
      consume_practice_note: { Args: { user_id: string }; Returns: boolean }
      create_bot_session: {
        Args: { p_force?: boolean; p_player_id: string }
        Returns: {
          opponent_id: string
          room_id: string
        }[]
      }
      create_practice_session: {
        Args: { p_game_type: string; p_player_id: string }
        Returns: string
      }
      create_session: {
        Args: { p_player1_id: string; p_player2_id: string }
        Returns: string
      }
      delete_account: { Args: never; Returns: undefined }
      find_match:
        | { Args: { p_max_mmr: number; p_min_mmr: number }; Returns: string }
        | {
            Args: { p_max_mmr: number; p_min_mmr: number; p_player_id: string }
            Returns: string
          }
        | {
            Args: {
              p_max_mmr: number
              p_min_mmr: number
              p_mode?: string
              p_player_id: string
            }
            Returns: string
          }
      finish_game: { Args: { p_room_id: string }; Returns: undefined }
      get_game_duration: { Args: { p_game_type: string }; Returns: number }
      get_game_highscores: {
        Args: { p_game_type: string; p_limit?: number }
        Returns: {
          avatar_url: string
          best_score: number
          country: string
          nickname: string
          rank: number
          user_id: string
        }[]
      }
      get_leaderboard: { Args: { p_user_id: string }; Returns: Json }
      get_player_match_history: {
        Args: {
          p_limit?: number
          p_mode?: string
          p_offset?: number
          p_user_id: string
        }
        Returns: {
          created_at: string
          game_mode: string
          is_friend: boolean
          opponent_avatar_url: string
          opponent_country: string
          opponent_id: string
          opponent_nickname: string
          result: string
          session_id: string
        }[]
      }
      get_profile_with_pencils: {
        Args: { user_id: string }
        Returns: {
          last_recharge_at: string
          pencils: number
          practice_last_recharge_at: string
          practice_notes: number
        }[]
      }
      get_server_time: { Args: never; Returns: string }
      get_tier_name: { Args: { p_mmr: number }; Returns: string }
      grant_ads_removal: { Args: { user_id: string }; Returns: boolean }
      grant_pencils: {
        Args: { amount: number; user_id: string }
        Returns: boolean
      }
      grant_practice_notes: {
        Args: { amount: number; user_id: string }
        Returns: boolean
      }
      handle_disconnection: {
        Args: { p_leaver_id: string; p_room_id: string }
        Returns: undefined
      }
      next_round: { Args: { p_room_id: string }; Returns: undefined }
      record_purchase: {
        Args: {
          p_platform: string
          p_product_id: string
          p_transaction_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      resolve_round: { Args: { p_room_id: string }; Returns: undefined }
      reward_ad_pencils: { Args: { user_id: string }; Returns: number }
      reward_ad_practice_notes: { Args: { user_id: string }; Returns: number }
      set_player_ready: {
        Args: { p_player_id: string; p_room_id: string }
        Returns: undefined
      }
      start_game: { Args: { p_room_id: string }; Returns: undefined }
      start_next_round: { Args: { p_room_id: string }; Returns: undefined }
      stat_increments: {
        Args: { p_game_type: string }
        Returns: {
          accuracy: number
          calculation: number
          judgment: number
          memory: number
          observation: number
          speed: number
        }[]
      }
      submit_move: {
        Args: { p_move: string; p_player_id: string; p_room_id: string }
        Returns: undefined
      }
      trigger_game_start: { Args: { p_room_id: string }; Returns: undefined }
      update_mmr: { Args: { p_room_id: string }; Returns: undefined }
      update_score: {
        Args: { p_player_id: string; p_room_id: string; p_score: number }
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
  public: {
    Enums: {},
  },
} as const
