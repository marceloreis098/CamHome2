# CamHome Surveillance System

Sistema de vigilância leve e inteligente projetado para Orange Pi rodando Ubuntu Server 22.04. O **CamHome** gerencia câmeras IP, monitora armazenamento e utiliza IA para análise de quadros.

## 📋 Pré-requisitos de Hardware

- **Placa:** Orange Pi 5 (ou Raspberry Pi 4 / Mini PC com Ubuntu)
- **Sistema Operacional:** Ubuntu Server 22.04 LTS
- **Armazenamento:** Cartão SD para o sistema + HD Externo USB (para gravações)

---

## 🔧 Guia de Instalação (Passo a Passo)

Siga estes passos na ordem exata.

### Passo 1: Limpeza Profunda (Remover Node Antigo)
Seu sistema está com o Node v12 (antigo) instalado. Precisamos removê-lo completamente antes de instalar o novo.

```bash
# 1. Remover nodejs antigo e bibliotecas associadas
sudo apt remove -y nodejs npm libnode72
sudo apt autoremove -y
sudo rm -f /usr/bin/node
sudo rm -f /usr/bin/npm

# 2. Atualizar o sistema e instalar utilitários básicos
sudo apt update
sudo apt install -y curl git ca-certificates gnupg
```

### Passo 2: Instalar Node.js 20 (O Passo Crítico)
O script abaixo configura o repositório, mas **você deve rodar o comando de instalação logo em seguida**.

```bash
# 1. Baixar e configurar o repositório NodeSource (v20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 2. IMPORTANTE: Instalar o Node.js (Execute este comando!)
# Se pular este passo, o npm não será instalado.
sudo apt install -y nodejs

# 3. VERIFICAÇÃO OBRIGATÓRIA:
# Rode os comandos abaixo.
node -v
# DEVE retornar: v20.x.x (Se retornar v12, algo deu errado no passo 1)

npm -v
# DEVE retornar: 10.x.x
```

### Passo 3: Baixar e Instalar o CamHome
Agora que o `npm` (v10+) e `node` (v20+) estão confirmados:

```bash
# 1. Clonar o repositório (Se já clonou, apenas entre na pasta)
git clone https://github.com/marceloreis098/CamHome.git

# 2. Entrar na pasta do projeto
cd CamHome

# 3. Instalar dependências
npm install

# 4. Compilar o projeto (Frontend)
npm run build
```

**Se o build funcionar, você verá: `✨ Built in X.XXs` e uma pasta `dist` será criada.**

### Passo 4: Configurar o Servidor Web (Nginx com Proxy API)

Isso permite que você acesse pelo IP na porta 80, enquanto o Nginx repassa as chamadas de sistema para o Node na porta 3000.

```bash
# 1. Instalar Nginx
sudo apt install -y nginx

# 2. Criar diretório do site e copiar arquivos
sudo mkdir -p /var/www/camhome
sudo cp -r dist/. /var/www/camhome/

# 3. Ajustar permissões (Crítico para evitar erro 403)
sudo chown -R www-data:www-data /var/www/camhome
sudo chmod -R 755 /var/www/camhome
```

### Passo 5: Ativar o Site e Proxy

1. Edite o arquivo de configuração:
```bash
sudo nano /etc/nginx/sites-available/camhome
```

2. Cole o conteúdo abaixo **(ATENÇÃO: Este bloco foi atualizado para corrigir o erro da API):**
```nginx
server {
    listen 80;
    server_name _;

    root /var/www/camhome;
    index index.html;

    # Serve a Aplicação React (Frontend)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Redireciona chamadas de API para o Backend Node.js
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
3. Salve (`Ctrl+O`, `Enter`) e Saia (`Ctrl+X`).

4. Reinicie o Nginx:
```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/camhome /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

### Passo 6: Rodar o Backend (Servidor Node)

Para que o Nmap funcione corretamente e escaneie a rede, o backend precisa estar rodando.

**Opção A: Rodar manualmente (para teste)**
```bash
sudo node server.js
# Mantenha o terminal aberto
```

**Opção B: Rodar em segundo plano (Definitivo - Recomendado)**
Use o PM2 para garantir que o servidor reinicie se cair ou se o Orange Pi reiniciar.

```bash
# 1. Instalar PM2 globalmente
sudo npm install -g pm2

# 2. Iniciar o servidor
sudo pm2 start server.js --name "camhome-backend"

# 3. Configurar para iniciar no boot
sudo pm2 startup
sudo pm2 save
```

---

## 🌐 Como Acessar

1. Descubra o IP do seu Orange Pi: `hostname -I`
2. Acesse no navegador: `http://SEU_IP` (Ex: `http://192.168.1.55`)
3. **Login Padrão**:
   - Usuário: `admin`
   - Senha: `password`

---

## 🆘 Solução de Erros

**Erro: `Unexpected token '<'` ao escanear**
- **Causa:** O Nginx não está configurado corretamente para repassar `/api/` para o Node.js.
- **Solução:** Refaça o passo 5 copiando o código Nginx atualizado.

**Erro: `Nmap not found`**
- **Solução:** `sudo apt install nmap`

---
**Desenvolvido por Marcelo Reis**