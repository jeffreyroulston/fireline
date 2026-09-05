//! Card type / kind labels used by the catalog and UI.

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum CardKind {
    Ally,
    Attack,
    Action,
    Item,
    Brick,
}

impl CardKind {
    pub const fn label(self) -> &'static str {
        match self {
            Self::Ally => "ally",
            Self::Attack => "attack",
            Self::Action => "action",
            Self::Item => "item",
            Self::Brick => "brick",
        }
    }
}
