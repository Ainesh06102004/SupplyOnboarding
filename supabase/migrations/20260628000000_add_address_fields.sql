ALTER TABLE delivery_addresses 
ADD COLUMN IF NOT EXISTS house_number TEXT, 
ADD COLUMN IF NOT EXISTS landmark TEXT;
