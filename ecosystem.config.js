module.exports = {
  apps : [{
    name   : "camhome-backend",
    script : "./server.js",
    env: {
      NODE_ENV: "production",
      PORT: 3000
    },
    // Reinicia se o uso de memória passar de 400MB
    max_memory_restart: '400M',
    
    // Logs
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    
    // Auto-restart em caso de falha
    autorestart: true,
    watch: false
  }]
}