-- Add 'sanctioned' entity type for OFAC / sanctions list addresses

ALTER TABLE entities
  DROP CONSTRAINT IF EXISTS entities_type_check;

ALTER TABLE entities
  ADD CONSTRAINT entities_type_check CHECK (
    entity_type IN (
      'exchange', 'protocol', 'bridge', 'fund', 'whale',
      'mixer', 'nft', 'stablecoin', 'oracle', 'dao', 'other',
      'institution', 'kol', 'hacker', 'miner', 'token', 'sanctioned'
    )
  );
