#!/bin/bash

set -e

PEM_PATH="/home/saurabh/Downloads/Pem-files/portfolio.pem"
ANSIBLE_PLAYBOOK="./terraform/ansible/install-k3s.yaml"
MANIFEST_DIR="./k3s-files"
TERRAFORM_DIR="./terraform"

cd "$TERRAFORM_DIR"
terraform init
terraform apply -auto-approve
EC2_IP=$(terraform output -raw instance_public_ip)
cd ..

if [[ -z "$EC2_IP" ]]; then
  echo "[!] EC2 Public IP not found. Exiting."
  exit 1
fi

echo "[✓] EC2 instance is at: $EC2_IP"

echo "[2/6] Waiting for SSH to be ready on $EC2_IP..."
until ssh -o StrictHostKeyChecking=no -i "$PEM_PATH" ubuntu@"$EC2_IP" "echo SSH up"; do
  sleep 5
done

ansible-playbook "$ANSIBLE_PLAYBOOK" -i "$EC2_IP," --private-key "$PEM_PATH" -u ubuntu

scp -i "$PEM_PATH" "$MANIFEST_DIR"/*.yaml ubuntu@"$EC2_IP":~/

ssh -i "$PEM_PATH" ubuntu@"$EC2_IP" <<EOF
  sudo kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.4/cert-manager.yaml
  sleep 20
  echo "Waiting for cert-manager to be ready..."
  sudo kubectl wait --for=condition=Available deployment --all -n cert-manager --timeout=300s
  
  sudo kubectl apply -f ~/cluster-issuer.yaml
  sudo kubectl apply -f ~/chainride.yaml
EOF

echo "[6/6] Deployment complete!"
echo "Visit your site at: https://chainride.saurabhmate.cloud"
