#!/bin/bash

# Define a pasta onde a aplicação será servida pelo Nginx
APP_DIR="/var/www/orangeguard"
# Define o ponto de montagem para o HD
MOUNT_POINT="/mnt/orange_drive_1tb"
# Define o nome do arquivo de configuração do Nginx
NGINX_CONF="orangeguard"

echo "========================================="
echo "  Iniciando Script Silencioso OrangeGuard"
echo "  (Todas as confirmações serão 'yes')"
echo "========================================="

# 1. Atualizar o Sistema e Instalar Dependências
echo "-> 1/5: Atualizando o sistema e instalando dependências (curl, build-essential)..."
# O uso do '-y' garante o 'yes' para updates e upgrades
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl build-essential

if [ $? -ne 0 ]; then
    echo "ERRO: Falha na atualização do sistema ou instalação de dependências."
    exit 1
fi

# 2. Instalar Node.js 20 (LTS)
echo "-> 2/5: Instalando Node.js 20 (LTS)..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# O uso do '-y' garante o 'yes' na instalação do nodejs
sudo apt install -y nodejs

if [ $? -ne 0 ]; then
    echo "ERRO: Falha na instalação do Node.js 20."
    exit 1
fi

# 3. Instalar e Configurar Nginx
echo "-> 3/5: Instalando e configurando Nginx..."
# O uso do '-y' garante o 'yes' na instalação do nginx
sudo apt install -y nginx

# Cria o arquivo de configuração do site Nginx
NGINX_SITE_CONF="/etc/nginx/sites-available/$NGINX_CONF"
echo "Criando o arquivo de configuração $NGINX_SITE_CONF..."

# Uso de 'cat << EOF' para escrever o bloco de configuração
sudo tee $NGINX_SITE_CONF > /dev/null << EOF
server {
    listen 80;
    server_name _;

    root $APP_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

# Ativa o site e remove o padrão
echo "Ativando o site e removendo a configuração padrão..."
sudo ln -sf $NGINX_SITE_CONF /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Reinicia o Nginx (será reiniciado novamente após o build)
sudo systemctl restart nginx

# 4. Compilar a Aplicação (Presume que o script é executado na raiz do projeto)
echo "-> 4/5: Compilando e movendo a aplicação..."

# Verifica se o diretório 'dist' existe após o build (indicador de sucesso)
if [ ! -f "package.json" ]; then
    echo "AVISO: O arquivo 'package.json' não foi encontrado. Pulando etapas 'npm install' e 'npm run build'."
    echo "Certifique-se de executar o script na pasta raiz do seu projeto."
else
    echo "Instalando dependências (npm install)..."
    npm install
    
    echo "Fazendo o build da aplicação (npm run build)..."
    npm run build

    # Cria o diretório de destino e move os arquivos
    echo "Movendo arquivos compilados para $APP_DIR..."
    sudo mkdir -p $APP_DIR
    sudo cp -r dist/* $APP_DIR/

    # Define permissões
    echo "Configurando permissões..."
    sudo chown -R www-data:www-data $APP_DIR
    sudo chmod -R 755 $APP_DIR

    # Reinicia o Nginx para garantir que a nova configuração e arquivos sejam lidos
    echo "Reiniciando o Nginx..."
    sudo systemctl restart nginx
fi


# 5. Configurar Diretórios e Firewall
echo "-> 5/5: Configurando diretórios de montagem e Firewall (UFW)..."

# Cria ponto de montagem e define permissões abertas
sudo mkdir -p $MOUNT_POINT
sudo chmod 777 $MOUNT_POINT

# Configura o Firewall (UFW)
echo "Configurando Firewall (UFW)..."
sudo ufw allow 22/tcp # SSH
sudo ufw allow 80/tcp # HTTP

# Comando para habilitar o UFW sem pedir confirmação, passando 'y' via pipe
echo "Habilitando UFW de forma silenciosa..."
echo "y" | sudo ufw enable

echo "========================================="
echo " Instalação concluída com sucesso!"
echo " A aplicação deve estar acessível via HTTP na porta 80."
echo "========================================="