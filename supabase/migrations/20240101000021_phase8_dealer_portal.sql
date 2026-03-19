-- Phase 8: Dealer Portal Participation Tables
-- Enables two-sided marketplace: dealer inbox, invite lifecycle, offer submission,
-- and external-to-onboarded dealer migration.

-- ---------------------------------------------------------------------------
-- sourcing_case_invites — case-level invites sent to onboarded dealers
-- ---------------------------------------------------------------------------
-- Lifecycle: PENDING → SENT → VIEWED → RESPONDED / DECLINED / EXPIRED
create table if not exists sourcing_case_invites (
  id          uuid primary key default gen_random_uuid(),
  case_id     text not null references "VehicleRequestCase"(id) on delete cascade,
  dealer_id   text not null references "Dealer"(id) on delete cascade,
  status      text not null default 'PENDING'
    check (status in ('PENDING','SENT','VIEWED','RESPONDED','DECLINED','EXPIRED')),
  notes       text,
  deadline    timestamptz,
  viewed_at   timestamptz,
  responded_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_sci_dealer on sourcing_case_invites(dealer_id);
create index if not exists idx_sci_case   on sourcing_case_invites(case_id);
create index if not exists idx_sci_status on sourcing_case_invites(status);

-- Prevent duplicate invites for the same case + dealer pair.
create unique index if not exists idx_sci_case_dealer
  on sourcing_case_invites(case_id, dealer_id);

-- ---------------------------------------------------------------------------
-- sourcing_case_offers — dealer-submitted offers through the portal
-- ---------------------------------------------------------------------------
-- Lifecycle: SUBMITTED → UNDER_REVIEW → SHORTLISTED → SELECTED / REJECTED / WITHDRAWN
create table if not exists sourcing_case_offers (
  id            uuid primary key default gen_random_uuid(),
  invite_id     uuid not null references sourcing_case_invites(id) on delete cascade,
  case_id       text not null references "VehicleRequestCase"(id) on delete cascade,
  dealer_id     text not null references "Dealer"(id) on delete cascade,
  listing_url   text,
  vin           text,
  year          int,
  make          text,
  model         text,
  trim          text,
  mileage       int,
  price_cents   int,
  fees_cents    int default 0,
  notes         text,
  status        text not null default 'SUBMITTED'
    check (status in ('SUBMITTED','UNDER_REVIEW','SHORTLISTED','SELECTED','REJECTED','WITHDRAWN')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_sco_invite  on sourcing_case_offers(invite_id);
create index if not exists idx_sco_case    on sourcing_case_offers(case_id);
create index if not exists idx_sco_dealer  on sourcing_case_offers(dealer_id);
create index if not exists idx_sco_status  on sourcing_case_offers(status);

-- ---------------------------------------------------------------------------
-- external_dealer_matches — map scraped external dealers → onboarded dealers
-- ---------------------------------------------------------------------------
create table if not exists external_dealer_matches (
  id                    uuid primary key default gen_random_uuid(),
  external_dealer_name  text not null,
  external_dealer_source text not null,
  dealer_id             text not null references "Dealer"(id) on delete cascade,
  matched_at            timestamptz not null default now(),
  matched_by            text,
  confidence            real default 1.0,
  notes                 text,
  created_at            timestamptz not null default now()
);

create index if not exists idx_edm_dealer on external_dealer_matches(dealer_id);
create index if not exists idx_edm_name   on external_dealer_matches(external_dealer_name);

-- Prevent duplicate matches for the same external name + source + dealer.
create unique index if not exists idx_edm_unique
  on external_dealer_matches(external_dealer_name, external_dealer_source, dealer_id);
