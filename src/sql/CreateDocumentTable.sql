CREATE TABLE IF NOT EXISTS `mails-sandbox.refined.documents`
(
    `account_id` STRING,
    `box_name` STRING,
    `created_at` TIMESTAMP,
    `date` TIMESTAMP,
    `document_id` STRING,
    `domain` STRING,
    `from` STRING,
    `id` STRING,
    `index` STRING,
    `order_id` STRING,
    `parser_id_sql` STRING,
    `parser_id` STRING,
    `parser_name` STRING,
    `parser_version` STRING,
    `parser` STRING,
    `signature` STRING,
    `type` STRING,
    `uid` INTEGER,
    `user_id` STRING,
    `data` STRUCT<
      `address` STRING,
      `arrival_address` STRING,
      `arrival_time` STRING,
      `author` STRING,
      `billing_address` STRING,
      `br_brand` STRING,
      `brand` STRING,
      `category_breadcrumb` STRING,
      `category` STRING,
      `console` STRING,
      `credit` STRING,
      `currency` STRING,
      `delivery_address` STRING,
      `delivery_date_max` STRING,
      `delivery_date_min` STRING,
      `delivery_fee` STRING,
      `delivery_time_max` STRING,
      `delivery_time_min` STRING,
      `delivery_type` STRING,
      `departure_address` STRING,
      `departure_time` STRING,
      `description` STRING,
      `distance_unit` STRING,
      `distance` STRING,
      `distinct_item_quantity` STRING,
      `driver` STRING,
      `fidelity_additional_points` STRING,
      `fidelity_program_name` STRING,
      `first_name` STRING,
      `is_gift` STRING,
      `name` STRING,
      `number_of_users` STRING,
      `option_1` STRING,
      `option_2` STRING,
      `option_3` STRING,
      `option_4` STRING,
      `option_5` STRING,
      `option_6` STRING,
      `order_date` STRING,
      `order_item_quantity` STRING,
      `order_quantity` STRING,
      `order_time` STRING,
      `original_order_number_raw` STRING,
      `original_order_number` STRING,
      `other_fee1_name` STRING,
      `other_fee1` STRING,
      `other_fee2_name` STRING,
      `other_fee2` STRING,
      `other_fees` STRING,
      `payment_type` STRING,
      `price_per_unit` STRING,
      `processing_fee` STRING,
      `promo` STRING,
      `publisher` STRING,
      `reference` STRING,
      `seller` STRING,
      `state` STRING,
      `tax` STRING,
      `total_fees` STRING,
      `total_paid` STRING,
      `total_price_paid` STRING,
      `url_img` STRING,
      `url_item` STRING,
      `voucher` STRING
    >
)