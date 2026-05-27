terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.16"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 3.0"
    }
  }
  required_version = ">= 1.2.0"
}

provider "aws" {
  region = "ap-south-1"
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

resource "aws_instance" "app_server" {
  ami           = "ami-02b8269d5e85954ef"
  instance_type = "t3.large"
  vpc_security_group_ids = [aws_security_group.TF_SG.id]
  key_name = "portfolio"

  root_block_device {
    volume_type = "gp3"
    volume_size = 50
  }

  tags = {
    Name = "Chainride"
  }
  

}
resource "random_id" "suffix" {
  byte_length = 4
}
resource "aws_security_group" "TF_SG" {
  name        = "Chainride-sg-${random_id.suffix.hex}"
  description = "security group using terraform"
  vpc_id      = "vpc-0d3f2299a5030a468"

  ingress {
    description      = "HTTPS"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  ingress {
    description      = "HTTP"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  ingress {
    description      = "SSH"
    from_port        = 22
    to_port          = 22
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

ingress {
    description      = "tcp"
    from_port        = 6443
    to_port          = 6443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # ingress {
  #   description      = "tcp"
  #   from_port        = 3000
  #   to_port          = 3000
  #   protocol         = "tcp"
  #   cidr_blocks      = ["0.0.0.0/0"]
  #   ipv6_cidr_blocks = ["::/0"]
  # }
#  ingress {
#     description      = "tcp"
#     from_port        = 31622
#     to_port          = 31622
#     protocol         = "tcp"
#     cidr_blocks      = ["0.0.0.0/0"]
#     ipv6_cidr_blocks = ["::/0"]
#   }

# ingress {
#     description      = "tcp"
#     from_port        = 9100
#     to_port          = 9100
#     protocol         = "tcp"
#     cidr_blocks      = ["0.0.0.0/0"]
#     ipv6_cidr_blocks = ["::/0"]
#   }
# ingress {
#     description      = "tcp"
#     from_port        = 9090
#     to_port          = 9090
#     protocol         = "tcp"
#     cidr_blocks      = ["0.0.0.0/0"]
#     ipv6_cidr_blocks = ["::/0"]
#   }
# ingress {
#     description      = "tcp"
#     from_port        = 3100
#     to_port          = 3100
#     protocol         = "tcp"
#     cidr_blocks      = ["0.0.0.0/0"]
#     ipv6_cidr_blocks = ["::/0"]
#   }
  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = {
    Name = "Chainride"
  }
}

resource "local_file" "inventory" {
  filename = "ansible/inventory.ini"
  content  = <<-EOT
    [server]
    ${aws_instance.app_server.public_ip} ansible_user=ubuntu ansible_ssh_private_key_file=/home/saurabh/Downloads/Pem-files/portfolio.pem
  EOT
}
 
resource "cloudflare_record" "terraform_subdomain" {
  zone_id = var.cloudflare_zone_id
  name    = "chainride"
  value   = aws_instance.app_server.public_ip
  type    = "A"
  ttl     = 1
  proxied = true
}   
output "instance_public_ip" {
  value = aws_instance.app_server.public_ip
}

output "subdomain_url" {
  value = "https://chainride.saurabhmate.cloud"
}
