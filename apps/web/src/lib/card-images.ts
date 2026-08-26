import type { CardId } from "@/lib/engine/types";

const GATCG_ORIGIN = "https://api.gatcg.com";

/** GATCG edition image paths for catalog cards with official art. */
const CARD_IMAGE_PATHS: Partial<Record<CardId, string>> = {
  arthur: "/cards/images/vn9fgfiy38.jpg",
  kingdom_informant: "/cards/images/wdxi74wb4y.jpg",
  clumsy_apprentice: "/cards/images/Gsl57juAHW.jpg",
  sable_remnant: "/cards/images/2ahEr0UKmG.jpg",
  hasty_messenger: "/cards/images/zb25m5c8lj.jpg",
  red_hare: "/cards/images/fokw35hv3j.jpg",
  ignited_stab: "/cards/images/8izzioxgug.jpg",
  rending_flames: "/cards/images/OiOzavefYK.jpg",
  blazing_throw: "/cards/images/129pcx7uyc.jpg",
  corhazi_courier: "/cards/images/s3572jtod1.jpg",
  veteran_blazebearer: "/cards/images/ijq63nobfs.jpg",
  sadi: "/cards/images/KyHItYENpc.jpg",
  captivating_cutthroat: "/cards/images/1h4pzmq492.jpg",
  dazzling_courtesan: "/cards/images/trg8idr6s7.jpg",
  fiery_interference: "/cards/images/in1rj6qet0.jpg",
  heated_vengeance: "/cards/images/1x041sk6lk.jpg",
  intensified_pyre: "/cards/images/p90l7heq7j.jpg",
  march_hare: "/cards/images/qxvut6f4ix.jpg",
  mark_the_target: "/cards/images/lztmw3rrii.jpg",
  peppered_chef: "/cards/images/giaidsyfgn.jpg",
  planted_explosive: "/cards/images/zevpnv6hwn.jpg",
  rococo: "/cards/images/p8m8o1j194.jpg",
  tweedledum: "/cards/images/ZtRu29fO87.jpg",
  vermilion_decree: "/cards/images/yrc9a8c16b.jpg",
  xiao_qiao: "/cards/images/dw4hsb2t91.jpg",
  hot_cake: "/cards/images/1W0SJDzIvQ.jpg",
  uncanny_realization: "/cards/images/zUDtPfAGKw.jpg",
  virgil: "/cards/images/yX6Ri6mnDg.jpg",
  vicious_slice: "/cards/images/5m6sqe6kd7.jpg",
};

export function cardImageUrl(id: CardId): string | null {
  const path = CARD_IMAGE_PATHS[id];
  return path ? `${GATCG_ORIGIN}${path}` : null;
}
