import {
  Html,
  Head,
  Body,
  Container,
  Heading,
  Text,
  Hr,
  Link,
  Img,
  Preview,
} from "@react-email/components";
import ReactMarkdown from "react-markdown";
export function EventEmail({
  subject,
  body,
  eventName,
  primary,
  logo,
  unsubscribeUrl,
}: {
  subject: string;
  body: string;
  eventName: string;
  primary: string;
  logo: string | null;
  unsubscribeUrl?: string;
}) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{subject}</Preview>
      <Body
        style={{
          backgroundColor: "#f4f4f4",
          fontFamily: "Arial,sans-serif",
          color: "#202020",
        }}
      >
        <Container
          style={{
            backgroundColor: "white",
            padding: "32px",
            maxWidth: "600px",
            borderTop: `4px solid ${/^#[a-f0-9]{3,8}$/i.test(primary) ? primary : "#a4ff60"}`,
          }}
        >
          {logo && <Img src={logo} alt={eventName} height="48" />}
          <Text>hacks / {eventName}</Text>
          <Heading>{subject}</Heading>
          <ReactMarkdown
        skipHtml
            components={{
              a: ({ href, children }) =>
                href && /^https?:\/\//i.test(href) ? (
                  <Link href={href}>{children}</Link>
                ) : (
                  <span>{children}</span>
                ),
              img: ({ alt }) => <span>{alt}</span>,
            }}
          >
            {body}
          </ReactMarkdown>
          <Hr />
          <Text style={{ fontSize: "12px" }}>hacks.mintedinpe.com</Text>
          {unsubscribeUrl && (
            <Link href={unsubscribeUrl}>
              Dejar de recibir anuncios de este evento
            </Link>
          )}
        </Container>
      </Body>
    </Html>
  );
}
