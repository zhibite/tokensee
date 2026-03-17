-- Extend entities_type_check to support new entity types:
--   institution  — foundations, companies, known orgs
--   kol          — key opinion leaders, crypto influencers
--   hacker       — known exploiters, phishing addresses
--   miner        — mining pools, validators
--   token        — token contracts (ERC-20, ERC-721 etc.)

ALTER TABLE entities
  DROP CONSTRAINT IF EXISTS entities_type_check;

ALTER TABLE entities
  ADD CONSTRAINT entities_type_check CHECK (
    entity_type IN (
      'exchange', 'protocol', 'bridge', 'fund', 'whale',
      'mixer', 'nft', 'stablecoin', 'oracle', 'dao', 'other',
      'institution', 'kol', 'hacker', 'miner', 'token'
    )
  );
