CREATE INDEX IF NOT EXISTS idx_bot_sessions_chat ON bot_sessions(chat_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_project ON alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_daily_logs_project_date ON daily_logs(project_id, date);